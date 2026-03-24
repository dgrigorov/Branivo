import '../repositories/ocr_models.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Talon parser — extracts vehicle registration fields from raw OCR text.
// Based on EU Directive 1999/37/EC field codes (Bulgarian СРМПС / малък талон).
// ─────────────────────────────────────────────────────────────────────────────

abstract final class TalonParser {
  static const double _highConf = 0.9;
  static const double _noConf = 0.0;
  static const double _threshold = 0.85;

  // Matches field codes: (A), (D.1), (C.2.1), etc.
  static final _fieldCodeRegex = RegExp(
    r'\(([A-Z][A-Z0-9]*(?:\.[0-9]+)?(?:\.[0-9]+)?)\)\**\s*(.*)',
    caseSensitive: false,
  );

  static final _plateRegex =
      RegExp(r'[А-ЯA-Z]{1,2}\d{3,4}[А-ЯA-Z]{1,2}', caseSensitive: false);
  static final _vinRegex =
      RegExp(r'[A-HJ-NPR-Z0-9]{17}', caseSensitive: false);
  static final _dateRegex = RegExp(r'(\d{2})[.\-/](\d{2})[.\-/](\d{4})');
  static final _certNumberRegex =
      RegExp(r'No\s+(\d{6,12})', caseSensitive: false);
  static final _egnRegex =
      RegExp(r'ЕГН[/\s]*(?:ID)?\s*(\d{10})', caseSensitive: false);
  static final _yearRegex = RegExp(r'\b((?:19|20)\d{2})\b');
  static final _bFieldRegex = RegExp(
    r'[({]?B[)}\s]\s*(\d{2})[.\-/](\d{2})[.\-/](\d{4})',
    caseSensitive: false,
  );

  static Map<String, OcrField> parse(String text) {
    final lines = text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    // ── (A) License plate ────────────────────────────────────────────────────
    final lpRaw = _extractByCode(lines, 'A');
    final lpMatch = lpRaw.value != null
        ? _plateRegex.firstMatch(lpRaw.value!)?.group(0)
        : _plateRegex.firstMatch(text)?.group(0);
    final lpValue = lpMatch ?? lpRaw.value?.split(RegExp(r'\s+')).first;

    // ── (E) VIN ───────────────────────────────────────────────────────────────
    final vinRaw = _extractByCode(lines, 'E');
    final vinMatch =
        vinRaw.value != null ? _vinRegex.firstMatch(vinRaw.value!)?.group(0) : null;
    final vinValue = vinMatch ??
        (vinRaw.value != null && vinRaw.value!.length == 17
            ? vinRaw.value
            : null);

    // ── Certificate number (No) ───────────────────────────────────────────────
    final certNumber = _certNumberRegex.firstMatch(text)?.group(1);

    // ── (D.1) Make and model ──────────────────────────────────────────────────
    final d1Raw = _extractByCode(lines, 'D.1');
    final (makeValue, modelValue) =
        _extractMakeModel(d1Raw.value, d1Raw.nextLine);

    // ── (R) Color ─────────────────────────────────────────────────────────────
    final colorRaw = _extractByCode(lines, 'R');
    final colorValue = colorRaw.value?.split(RegExp(r'\s+')).first;

    // ── (B) First registration date ───────────────────────────────────────────
    // Priority 1: direct (B) label in raw text
    final bMatch = _bFieldRegex.firstMatch(text);
    final firstRegFromBDirect = bMatch != null
        ? '${bMatch.group(1)}.${bMatch.group(2)}.${bMatch.group(3)}'
        : null;
    // Priority 2: structured fields map
    final d1Date = firstRegFromBDirect ??
        (d1Raw.value != null
            ? _dateRegex.firstMatch(_extractByCode(lines, 'B').value ?? '')?.group(0)
            : null);
    final firstRegDateFinal = d1Date ??
        _extractByPatternGroup(
          lines,
          RegExp(r'\(B\)\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4})', caseSensitive: false),
        );
    final firstRegRaw = _extractByCode(lines, 'B');

    // ── Year ──────────────────────────────────────────────────────────────────
    String? yearValue;
    if (bMatch != null) {
      yearValue = bMatch.group(3);
    } else if (firstRegRaw.value != null) {
      yearValue = _yearRegex.firstMatch(firstRegRaw.value!)?.group(1);
    }
    yearValue ??= _extractByPatternGroup(lines, _yearRegex);

    // ── (P.1) Engine volume ───────────────────────────────────────────────────
    final engineVolumeRaw = _extractByCode(lines, 'P.1');

    // ── (P.3) Fuel type ───────────────────────────────────────────────────────
    final fuelRaw = _extractByCode(lines, 'P.3');
    final fuelMatch = fuelRaw.value != null
        ? RegExp(r'([А-ЯA-Z]+)', caseSensitive: false).firstMatch(fuelRaw.value!)
        : null;
    final fuelCyrillic = fuelMatch?.group(1);

    // ── (C.2.1) Surname, (C.2.2) Given name, (C.2.3) Address ─────────────────
    final c21 = _extractByCode(lines, 'C.2.1');
    final c22 = _extractByCode(lines, 'C.2.2');
    final c23 = _extractByCode(lines, 'C.2.3');

    final surnameLatin = c21.nextLine ??
        RegExp(r'[A-Z][A-Za-z]+').firstMatch(c21.value ?? '')?.group(0);
    final givenLatin = c22.nextLine?.trim() ??
        RegExp(r'[A-Z][A-Za-z\s]+').firstMatch(c22.value ?? '')?.group(0)?.trim();

    String? ownerName;
    if (surnameLatin != null && givenLatin != null) {
      ownerName = '$surnameLatin $givenLatin'.trim();
    } else {
      final combined = '${c21.value ?? ''} ${c22.value ?? ''}'.trim();
      if (combined.isNotEmpty) ownerName = combined;
    }

    // ── EGN / personal ID ─────────────────────────────────────────────────────
    final egnDirect = _egnRegex.firstMatch(text)?.group(1);
    String? mrzEgn;
    if (egnDirect == null) {
      for (final line in lines.where((l) => l.contains('<'))) {
        final norm = line.replaceAll(RegExp(r'\s+'), '');
        final m = RegExp(r'[A-HJ-NPR-Z0-9]{17}(\d{10})', caseSensitive: false)
            .firstMatch(norm);
        if (m != null) {
          mrzEgn = m.group(1);
          break;
        }
      }
    }
    final egnValue = egnDirect ?? mrzEgn;
    final egnConf = egnDirect != null
        ? _highConf
        : (mrzEgn != null ? 0.85 : _noConf);

    return {
      'license_plate': _build(lpValue, lpValue != null ? _highConf : _noConf),
      'vin': _build(vinValue, vinValue != null ? _highConf : _noConf),
      'cert_number':
          _build(certNumber, certNumber != null ? _highConf : _noConf),
      'make': _build(makeValue, d1Raw.confidence),
      'model': _build(modelValue, d1Raw.confidence),
      'year': _build(yearValue, yearValue != null ? _highConf : _noConf),
      'color': _build(colorValue, colorRaw.confidence),
      'engine_volume':
          _build(engineVolumeRaw.value, engineVolumeRaw.confidence),
      'fuel_type': _build(
        fuelCyrillic != null ? _normalizeFuel(fuelCyrillic) : null,
        fuelRaw.confidence,
      ),
      'first_registration_date': _build(
        firstRegDateFinal,
        firstRegDateFinal != null ? _highConf : _noConf,
      ),
      'owner_name': _build(
        ownerName,
        c21.confidence > 0 ? c21.confidence : c22.confidence,
      ),
      'owner_egn': _build(egnValue, egnConf),
      'owner_address': _build(c23.value, c23.confidence),
    };
  }

  static OcrField _build(String? value, double confidence) {
    final v = (value?.isEmpty ?? true) ? null : value;
    return OcrField(
      value: v,
      confidence: v != null ? confidence : _noConf,
      autoFilled: v != null && confidence >= _threshold,
    );
  }

  // Extract value after a field code like (A), (D.1), (C.2.1).
  // Returns the value, its confidence, and the next continuation line if any.
  static ({String? value, double confidence, String? nextLine}) _extractByCode(
    List<String> lines,
    String code,
  ) {
    final escaped = code.replaceAll('.', r'\.');
    final re = RegExp('\\($escaped\\)\\**\\s*(.*)', caseSensitive: false);

    for (int i = 0; i < lines.length; i++) {
      final m = re.firstMatch(lines[i]);
      if (m != null) {
        final val = m
            .group(1)!
            .split(RegExp(r'\s{2,}|\t|\s+\([A-Z]|\s+No\b'))
            .first
            .replaceAll(RegExp(r'\*+'), '')
            .trim();
        final nextRaw = i + 1 < lines.length ? lines[i + 1] : null;
        final nextLine =
            (nextRaw != null && !nextRaw.startsWith('(') && !nextRaw.startsWith('No'))
                ? nextRaw.replaceAll(RegExp(r'\*+'), '').trim()
                : null;
        if (val.isNotEmpty) {
          return (
            value: val,
            confidence: _highConf,
            nextLine: (nextLine?.isEmpty ?? true) ? null : nextLine,
          );
        }
      }
    }
    return (value: null, confidence: _noConf, nextLine: null);
  }

  // Extract the first capture group from the first line matching pattern.
  static String? _extractByPatternGroup(List<String> lines, RegExp pattern) {
    for (final line in lines) {
      final m = pattern.firstMatch(line);
      if (m != null) return m.group(1)?.trim();
    }
    return null;
  }

  static (String?, String?) _extractMakeModel(
      String? d1Value, String? nextLine) {
    final candidate = nextLine ?? d1Value ?? '';
    if (candidate.isEmpty) return (null, null);

    // Prefer Latin make/model pattern: e.g. "MERCEDES S 350"
    final latinMatch =
        RegExp(r'([A-Z][A-Z-]{1,20})\s+([A-Z0-9][A-Z0-9\s-]{1,15})')
            .firstMatch(candidate);
    if (latinMatch != null) {
      return (latinMatch.group(1)?.trim(), latinMatch.group(2)?.trim());
    }

    if (d1Value != null) {
      final first = d1Value.split(RegExp(r'\s+')).first;
      return (first.isEmpty ? null : first, null);
    }
    return (null, null);
  }

  static String _normalizeFuel(String raw) {
    final u = raw.toUpperCase();
    if (u.contains('БЕНЗИН') || u.contains('PETROL')) return 'Бензин';
    if (u.contains('ДИЗЕЛ') || u.contains('DIESEL')) return 'Дизел';
    if (u.contains('ГАЗ') || u.contains('LPG')) return 'Газ (LPG)';
    if (u.contains('ЕЛЕКТР') || u.contains('ELECTR')) return 'Електрически';
    if (u.contains('ХИБРИД') || u.contains('HYBRID')) return 'Хибрид';
    return raw;
  }

  // For use in tests — exposes the field-code extractor directly.
  static Map<String, String> extractFields(String text) {
    final lines = text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();
    final result = <String, String>{};
    for (final m in _fieldCodeRegex.allMatches(text)) {
      final code = m.group(1)!.toUpperCase();
      final value = m.group(2)?.replaceAll(RegExp(r'\*+'), '').trim() ?? '';
      if (value.isNotEmpty) result[code] = value;
    }
    // Also extract codes via the strict per-line extractor for accuracy.
    for (final code in ['A', 'E', 'B', 'D.1', 'R', 'P.1', 'P.3',
        'C.2.1', 'C.2.2', 'C.2.3']) {
      final extracted = _extractByCode(lines, code);
      if (extracted.value != null) result[code] = extracted.value!;
    }
    return result;
  }
}
