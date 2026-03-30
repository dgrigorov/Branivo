enum OcrJobStatus { pending, processing, completed, failed }

enum OcrProvider { googleVision, awsTextract, mlKit, branivoOcr }

enum ScoreBucketDto { auto, top3, manual }

class OcrField {
  const OcrField({
    required this.value,
    required this.confidence,
    required this.autoFilled,
  });

  factory OcrField.fromJson(Map<String, dynamic> json) => OcrField(
        value: json['value'] as String?,
        confidence: (json['confidence'] as num).toDouble(),
        autoFilled: json['auto_filled'] as bool? ?? false,
      );

  final String? value;
  final double confidence;
  final bool autoFilled;

  bool get isLowConfidence => confidence < 0.85;
}

class OcrScanResponse {
  const OcrScanResponse({
    required this.jobId,
    required this.status,
    this.provider,
    this.fields,
    this.avgConfidence,
    this.rawText,
  });

  factory OcrScanResponse.fromJson(Map<String, dynamic> json) {
    final statusStr = json['status'] as String;
    final status = OcrJobStatus.values.firstWhere(
      (e) => e.name == statusStr,
      orElse: () => OcrJobStatus.processing,
    );

    Map<String, OcrField>? fields;
    if (json['fields'] != null) {
      fields = (json['fields'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, OcrField.fromJson(v as Map<String, dynamic>)),
      );
    }

    return OcrScanResponse(
      jobId: json['jobId'] as String,
      status: status,
      fields: fields,
      avgConfidence: json['avgConfidence'] != null
          ? (json['avgConfidence'] as num).toDouble()
          : null,
    );
  }

  final String jobId;
  final OcrJobStatus status;
  final OcrProvider? provider;
  final Map<String, OcrField>? fields;
  final double? avgConfidence;
  /// Raw text as recognized by ML Kit (debug only — not sent to server).
  final String? rawText;
}

// ─── Enrichment models ────────────────────────────────────────────────────────

class KatResult {
  const KatResult({required this.status, this.rawData});
  final String? status; // 'ok' | 'invalid' | 'stolen' | null
  final Map<String, dynamic>? rawData;
}

class GfResult {
  const GfResult({
    required this.timedOut,
    this.policyFound = false,
    this.insurer,
    this.validUntil,
  });

  final bool timedOut;
  final bool policyFound;
  final String? insurer;
  final String? validUntil;
}

class NhtsaResult {
  const NhtsaResult({required this.make, required this.model, this.year});
  final String? make;
  final String? model;
  final int? year;
}

class ExistingPolicyBlock {
  const ExistingPolicyBlock({required this.policyNumber, required this.insurer});
  final String policyNumber;
  final String insurer;
}

class OcrEnrichmentResult {
  const OcrEnrichmentResult({
    this.policyBlock,
    this.kat,
    this.gf,
    this.nhtsa,
    this.durationMs = 0,
  });

  final ExistingPolicyBlock? policyBlock;
  final KatResult? kat;
  final GfResult? gf;
  final NhtsaResult? nhtsa;
  final int durationMs;

  factory OcrEnrichmentResult.fromJson(Map<String, dynamic> json) {
    ExistingPolicyBlock? policyBlock;
    if (json['existing_policy'] != null) {
      final ep = json['existing_policy'] as Map<String, dynamic>;
      if (ep['status'] == 'ok' && ep['data'] != null) {
        final data = ep['data'] as Map<String, dynamic>;
        policyBlock = ExistingPolicyBlock(
          policyNumber: data['policy_number'] as String? ?? '',
          insurer: data['insurer'] as String? ?? '',
        );
      }
    }

    GfResult? gf;
    if (json['gf'] != null) {
      final gfRaw = json['gf'] as Map<String, dynamic>;
      if (gfRaw['status'] == 'timeout') {
        gf = const GfResult(timedOut: true);
      } else if (gfRaw['status'] == 'ok' && gfRaw['data'] != null) {
        final data = gfRaw['data'] as Map<String, dynamic>;
        gf = GfResult(
          timedOut: false,
          policyFound: data['policy_found'] as bool? ?? false,
          insurer: data['insurer'] as String?,
          validUntil: data['valid_until'] as String?,
        );
      } else {
        gf = const GfResult(timedOut: false);
      }
    }

    KatResult? kat;
    if (json['kat'] != null) {
      final katRaw = json['kat'] as Map<String, dynamic>;
      if (katRaw['status'] == 'ok' && katRaw['data'] != null) {
        final data = katRaw['data'] as Map<String, dynamic>;
        kat = KatResult(status: data['status'] as String?, rawData: data);
      } else {
        kat = const KatResult(status: null);
      }
    }

    NhtsaResult? nhtsa;
    if (json['nhtsa'] != null) {
      final nhtsaRaw = json['nhtsa'] as Map<String, dynamic>;
      if (nhtsaRaw['status'] == 'ok' && nhtsaRaw['data'] != null) {
        final data = nhtsaRaw['data'] as Map<String, dynamic>;
        nhtsa = NhtsaResult(
          make: data['make'] as String?,
          model: data['model'] as String?,
          year: data['year'] as int?,
        );
      }
    }

    return OcrEnrichmentResult(
      policyBlock: policyBlock,
      kat: kat,
      gf: gf,
      nhtsa: nhtsa,
      durationMs: json['duration_ms'] as int? ?? 0,
    );
  }
}

// ─── OCR Log payload ──────────────────────────────────────────────────────────

class OcrLogPayload {
  const OcrLogPayload({
    this.blurVariance,
    this.brightnessAvg,
    this.frameFillPct,
    this.photoCount,
    this.mlkitConfidence,
    this.mlkitFieldConfidences,
    this.visionUsed,
    this.visionConfidence,
    this.visionFieldConfidences,
    this.scoreCc,
    this.scoreKw,
    this.scoreMake,
    this.scoreModel,
    this.scoreYear,
    this.finalScore,
    this.scoreBucket,
    this.vinFound,
    this.katHit,
    this.gfHit,
    this.gfPolicyFound,
    this.enrichmentDurationMs,
    this.userCorrectedFields,
    this.userSelectedRank,
    this.finalVehicleId,
    this.quoteInitiated,
  });

  final double? blurVariance;
  final double? brightnessAvg;
  final double? frameFillPct;
  final int? photoCount;
  final double? mlkitConfidence;
  final Map<String, double>? mlkitFieldConfidences;
  final bool? visionUsed;
  final double? visionConfidence;
  final Map<String, double>? visionFieldConfidences;
  final double? scoreCc;
  final double? scoreKw;
  final double? scoreMake;
  final double? scoreModel;
  final double? scoreYear;
  final double? finalScore;
  final ScoreBucketDto? scoreBucket;
  final bool? vinFound;
  final bool? katHit;
  final bool? gfHit;
  final bool? gfPolicyFound;
  final int? enrichmentDurationMs;
  final List<String>? userCorrectedFields;
  final int? userSelectedRank;
  final String? finalVehicleId;
  final bool? quoteInitiated;

  Map<String, dynamic> toJson() => {
    if (blurVariance != null) 'blur_variance': blurVariance,
    if (brightnessAvg != null) 'brightness_avg': brightnessAvg,
    if (frameFillPct != null) 'frame_fill_pct': frameFillPct,
    if (photoCount != null) 'photo_count': photoCount,
    if (mlkitConfidence != null) 'mlkit_confidence': mlkitConfidence,
    if (mlkitFieldConfidences != null) 'mlkit_field_confidences': mlkitFieldConfidences,
    if (visionUsed != null) 'vision_used': visionUsed,
    if (visionConfidence != null) 'vision_confidence': visionConfidence,
    if (visionFieldConfidences != null) 'vision_field_confidences': visionFieldConfidences,
    if (scoreCc != null) 'score_cc': scoreCc,
    if (scoreKw != null) 'score_kw': scoreKw,
    if (scoreMake != null) 'score_make': scoreMake,
    if (scoreModel != null) 'score_model': scoreModel,
    if (scoreYear != null) 'score_year': scoreYear,
    if (finalScore != null) 'final_score': finalScore,
    if (scoreBucket != null) 'score_bucket': scoreBucket!.name,
    if (vinFound != null) 'vin_found': vinFound,
    if (katHit != null) 'kat_hit': katHit,
    if (gfHit != null) 'gf_hit': gfHit,
    if (gfPolicyFound != null) 'gf_policy_found': gfPolicyFound,
    if (enrichmentDurationMs != null) 'enrichment_duration_ms': enrichmentDurationMs,
    if (userCorrectedFields != null) 'user_corrected_fields': userCorrectedFields,
    if (userSelectedRank != null) 'user_selected_rank': userSelectedRank,
    if (finalVehicleId != null) 'final_vehicle_id': finalVehicleId,
    if (quoteInitiated != null) 'quote_initiated': quoteInitiated,
  };
}
