import { ForbiddenException } from '@nestjs/common';

export class VehicleBlockedByGfException extends ForbiddenException {
  constructor() {
    super({
      message:
        'Вашето МПС има нерегламентиран статус и не може да бъде застраховано.',
      code: 'GF_BLOCKED',
    });
  }
}
