import { auth } from '@/app/(auth)/auth';
import { getToken } from 'next-auth/jwt';
import { isDevelopmentEnvironment } from '@/lib/constants';

export async function GET(request: Request) {
  const session = await auth();
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  return Response.json({
    hasSession: !!session,
    hasToken: !!token,
    sessionUserId: session?.user?.id,
    sessionUserType: session?.user?.type,
    tokenId: token?.id,
    tokenType: token?.type,
    cookieHeader: request.headers.get('cookie'),
    environment: process.env.NODE_ENV,
    isDev: isDevelopmentEnvironment,
  });
}
