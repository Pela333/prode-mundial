import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_COOKIE_PREFIX = 'sb-'

function clearAuthCookies(req: NextRequest, res: NextResponse) {
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith(SUPABASE_COOKIE_PREFIX)) {
      res.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() puede throwear si el refresh token es inválido (cookie stale).
  // En ese caso, limpiamos las cookies y tratamos como no autenticado.
  let user: { id: string } | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data.user
  } catch {
    // Refresh token inválido o cookie corrupta — ignoramos y limpiamos abajo
  }

  const pathname = request.nextUrl.pathname
  const playerProtected = ['/prode', '/ranking', '/perfil']
  const adminProtected = ['/admin']
  const isPlayerProtected = playerProtected.some(p => pathname.startsWith(p))
  const isAdminProtected = adminProtected.some(p => pathname.startsWith(p))

  if (!user && (isPlayerProtected || isAdminProtected)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    clearAuthCookies(request, redirectResponse)
    return redirectResponse
  }

  if (user && isAdminProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/prode'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
