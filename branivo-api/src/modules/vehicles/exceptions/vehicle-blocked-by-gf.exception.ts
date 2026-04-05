import { ForbiddenException } from '@nestjs/common';

export class VehicleBlockedByGfException extends ForbiddenException {
  constructor() {
    super({
      message:
        'Проверката на МПС показа нередност. Моля, свържете се с брокера.',
      code: 'GF_BLOCKED',
    });
  }
}
