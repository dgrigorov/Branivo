import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

@Injectable()
export class ClientJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<T extends AuthenticatedUser>(
    err: Error | null,
    user: T | false,
  ): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    if (user.role !== 'end_client') {
      throw new UnauthorizedException('Endpoint reserved for end clients');
    }
    return user;
  }
}
