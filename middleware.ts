import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get('authorization')
  const url = request.nextUrl

  // Edge runtime environment variables
  const validUser = process.env.AUTH_USERNAME
  const validPass = process.env.AUTH_PASSWORD

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')

    if (user === validUser && pwd === validPass) {
      return NextResponse.next()
    }
  }

  // Debug: return env status in header when auth fails
  url.pathname = '/api/auth'
  const response = NextResponse.rewrite(url)
  response.headers.set('X-Debug-Has-User', validUser ? 'yes' : 'no')
  response.headers.set('X-Debug-Has-Pass', validPass ? 'yes' : 'no')
  response.headers.set('X-Debug-User-Len', validUser?.length?.toString() || '0')
  response.headers.set('X-Debug-Pass-Len', validPass?.length?.toString() || '0')

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')
    response.headers.set('X-Debug-Sent-User-Len', user?.length?.toString() || '0')
    response.headers.set('X-Debug-User-Match', (user === validUser).toString())
    response.headers.set('X-Debug-Pass-Match', (pwd === validPass).toString())
  }

  return response
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
