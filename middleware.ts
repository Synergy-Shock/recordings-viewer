import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get('authorization')
  const url = request.nextUrl

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')

    const validUser = process.env.AUTH_USERNAME
    const validPass = process.env.AUTH_PASSWORD

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
