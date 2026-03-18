import { SetMetadata } from '@nestjs/common';

export const FeatureFlag = (flag: string) => SetMetadata('feature_flag', flag);
