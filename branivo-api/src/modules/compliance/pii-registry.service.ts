import { Injectable } from '@nestjs/common';
import {
  getPiiFields,
  EntityClass,
} from '../../shared/decorators/pii-field.decorator';
import {
  PiiClassification,
  PiiFieldMetadata,
} from '../../shared/types/pii.types';
import { User } from '../users/entities/user.entity';
import { EndClient } from '../clients/entities/end-client.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Policy } from '../policies/entities/policy.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { OcrJobEntity } from '../ocr/entities/ocr-job.entity';
import { Shipment } from '../logistics/entities/shipment.entity';
import { FleetVehicle } from '../fleet/entities/fleet-vehicle.entity';

const REGISTERED_ENTITIES: EntityClass[] = [
  User,
  EndClient,
  Vehicle,
  Payment,
  Policy,
  Quote,
  OcrJobEntity,
  Shipment,
  FleetVehicle,
];

@Injectable()
export class PiiRegistryService {
  private cachedAllFields: PiiFieldMetadata[] | null = null;

  getAllPiiFields(): PiiFieldMetadata[] {
    if (this.cachedAllFields === null) {
      this.cachedAllFields = REGISTERED_ENTITIES.flatMap((entityClass) =>
        getPiiFields(entityClass),
      );
    }
    return this.cachedAllFields;
  }

  getFieldsForEntity(entityClass: EntityClass): PiiFieldMetadata[] {
    return getPiiFields(entityClass);
  }

  getFieldsByClassification(
    classification: PiiClassification,
  ): PiiFieldMetadata[] {
    return this.getAllPiiFields().filter(
      (field) => field.classification === classification,
    );
  }
}
