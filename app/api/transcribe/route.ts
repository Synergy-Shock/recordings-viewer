import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getFileBuffer, uploadFile, findSessionPrefix } from '@/lib/s3'

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

// Map audio types to their S3 paths and VTT output paths (relative to session prefix)
const AUDIO_CONFIG: Record<string, { audioPath: string; vttPath: string }> = {
  'screen-audio': { audioPath: 'screen/audio.wav', vttPath: 'screen/audio.vtt' },
  'audio-raw': { audioPath: 'audio/raw.wav', vttPath: 'audio/raw.vtt' },
  'audio-clean': { audioPath: 'audio/clean.wav', vttPath: 'audio/clean.vtt' },
}

interface WhisperSegment {
  text: string
  start: number
  end: number
}

interface WhisperResponseFull {
  text: string
  segments?: WhisperSegment[]
}

interface SubtitleCue {
  start: number
  end: number
  text: string
}

// Convert seconds to WebVTT timestamp format (HH:MM:SS.mmm)
function formatVttTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

// Convert cues to WebVTT format
function convertToVtt(cues: SubtitleCue[]): string {
  let vtt = 'WEBVTT\n\n'

  cues.forEach((cue, index) => {
    const startTime = formatVttTimestamp(cue.start)
    const endTime = formatVttTimestamp(cue.end)
    const text = cue.text.trim()

    vtt += `${index + 1}\n`
    vtt += `${startTime} --> ${endTime}\n`
    vtt += `${text}\n\n`
  })

  return vtt
}

export async function POST(request: Request) {
  try {
    const { sessionId, audioType, org, device } = await request.json()

    if (!sessionId || !audioType) {
      return NextResponse.json(
        { error: 'Missing sessionId or audioType' },
        { status: 400 }
      )
    }

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    const config = AUDIO_CONFIG[audioType]
    if (!config) {
      return NextResponse.json(
        { error: 'Invalid audioType. Must be one of: screen-audio, audio-raw, audio-clean' },
        { status: 400 }
      )
    }

    const prefix = await findSessionPrefix(org, device, sessionId)
    if (!prefix) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }
    const audioKey = `${prefix}/${config.audioPath}`
    const vttKey = `${prefix}/${config.vttPath}`

    // Download the audio file from S3
    const audioBuffer = await getFileBuffer(audioKey)

    // Create a File object for the OpenAI API
    // Convert Buffer to ArrayBuffer for Blob compatibility
    const arrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    ) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' })
    const audioFile = new File([blob], 'audio.wav', { type: 'audio/wav' })

    // Send to Whisper API with Spanish language
    // IMPORTANT: Include BOTH 'segment' and 'word' granularities
    // This fixes a known Whisper bug where first segment always starts at 0.00
    // See: https://community.openai.com/t/whisper-segment-start-times/718953
    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment', 'word'],
    })

    // Extract segments from response - they have accurate timing with gaps
    const whisperResponse = transcription as unknown as WhisperResponseFull
    const cues: SubtitleCue[] = (whisperResponse.segments || []).map(seg => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }))

    // Convert to WebVTT format and upload to S3
    const vttContent = convertToVtt(cues)
    await uploadFile(vttKey, vttContent, 'text/vtt')

    return NextResponse.json({
      success: true,
      vttKey,
      text: transcription.text,
      segmentCount: cues.length,
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}
