import { Global, Module } from '@nestjs/common';
import { PiiRegistryService } from './pii-registry.service';

@Global()
@Module({
  providers: [PiiRegistryService],
  exports: [PiiRegistryService],
})
export class ComplianceModule {}
