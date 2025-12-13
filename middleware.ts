import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get('authorization')
  const url = request.nextUrl

  // Edge runtime environment variables
  const validUser = process.env.AUTH_USERNAME
  const validPass = process.env.AUTH_PASSWORD

  // Debug logging (remove after testing)
  console.log('Middleware running - has validUser:', !!validUser, 'has validPass:', !!validPass)

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')

    console.log('Auth attempt - user:', user, 'matches:', user === validUser, 'pwd matches:', pwd === validPass)

    if (user === validUser && pwd === validPass) {
      return NextResponse.next()
    }
  }

  url.pathname = '/api/auth'
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
