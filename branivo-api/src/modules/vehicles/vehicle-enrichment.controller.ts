import { Controller, Get, Query } from '@nestjs/common';
import { VehicleEnrichmentService } from './vehicle-enrichment.service';
import { EnrichVehicleQueryDto } from './dto/enrich-vehicle-query.dto';
import { EnrichmentResponse } from './vehicle-enrichment.service';

@Controller('vehicles')
export class VehicleEnrichmentController {
  constructor(
    private readonly vehicleEnrichmentService: VehicleEnrichmentService,
  ) {}

  /**
   * GET /api/v1/vehicles/enrich?fields=kat,gf,nhtsa&reg_number=...&vin=...
   *
   * Runs only the requested fields in parallel.
   * Each field result: { status: 'ok'|'timeout'|'error', data?: {...} }
   */
  @Get('enrich')
  async enrich(
    @Query() query: EnrichVehicleQueryDto,
  ): Promise<EnrichmentResponse> {
    return this.vehicleEnrichmentService.enrich(query);
  }
}
