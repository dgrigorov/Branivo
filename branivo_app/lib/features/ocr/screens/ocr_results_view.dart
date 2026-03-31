import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../data/repositories/ocr_models.dart';
import 'ocr_wizard_constants.dart';

class OcrResultsView extends StatefulWidget {
  const OcrResultsView({
    super.key,
    required this.fields,
    required this.onProceed,
    required this.onManualEntry,
    this.rawText,
    this.debugImages,
  });

  final Map<String, OcrField> fields;
  final void Function(Map<String, OcrField>) onProceed;
  final VoidCallback onManualEntry;
  final String? rawText;
  /// Base64 JPEG previews of what Tesseract actually processed, one per step.
  final List<String>? debugImages;

  @override
  State<OcrResultsView> createState() => _OcrResultsViewState();
}

class _OcrResultsViewState extends State<OcrResultsView> {
  bool _showDebug = false;
  late final Map<String, TextEditingController> _controllers;

  @override
  void initState() {
    super.initState();
    _controllers = {
      for (final key in kFieldLabels.keys)
        key: TextEditingController(text: widget.fields[key]?.value ?? ''),
    };
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, OcrField> _buildEdited() => {
        for (final e in _controllers.entries)
          if (e.value.text.isNotEmpty)
            e.key: OcrField(
              value: e.value.text,
              confidence: widget.fields[e.key]?.confidence ?? 1.0,
              autoFilled: false,
            ),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kOcrBg,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  if (_showDebug) ...[
                    _DebugSection(
                      fields: widget.fields,
                      rawText: widget.rawText,
                      debugImages: widget.debugImages,
                    ),
                    const SizedBox(height: 16),
                    const Divider(color: Colors.white12),
                    const SizedBox(height: 8),
                  ],
                  ...kFieldLabels.entries.map(
                    (e) => _FieldCard(
                      label: e.value,
                      fieldKey: e.key,
                      field: widget.fields[e.key],
                      controller: _controllers[e.key]!,
                    ),
                  ),
                ],
              ),
            ),
            _buildProceedButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: kOcrGreen, size: 22),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Разпознати данни',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          IconButton(
            icon: Icon(
              _showDebug ? Icons.bug_report : Icons.bug_report_outlined,
              color: _showDebug ? Colors.amber : kOcrMuted,
              size: 20,
            ),
            tooltip: 'Raw OCR',
            onPressed: () => setState(() => _showDebug = !_showDebug),
          ),
          TextButton(
            onPressed: widget.onManualEntry,
            child: const Text(
              'Редактирай',
              style: TextStyle(color: kOcrIndigo, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProceedButton() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: SizedBox(
        width: double.infinity,
        height: 52,
        child: ElevatedButton(
          onPressed: () => widget.onProceed(_buildEdited()),
          style: ElevatedButton.styleFrom(
            backgroundColor: kOcrIndigo,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Text(
            'Продължи към офертите',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
      ),
    );
  }
}

// ─── Individual field card ─────────────────────────────────────────────────────

class _FieldCard extends StatelessWidget {
  const _FieldCard({
    required this.label,
    required this.fieldKey,
    required this.field,
    required this.controller,
  });

  final String label;
  final String fieldKey;
  final OcrField? field;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final isMissing = field == null || (field!.value?.isEmpty ?? true);
    final isLow = field?.isLowConfidence ?? true;

    final Color borderColor;
    final Color iconColor;
    final IconData iconData;
    if (isMissing) {
      borderColor = Colors.red.withAlpha(120);
      iconColor = Colors.red.shade300;
      iconData = Icons.edit_outlined;
    } else if (isLow) {
      borderColor = Colors.amber.withAlpha(100);
      iconColor = Colors.amber;
      iconData = Icons.warning_amber_rounded;
    } else {
      borderColor = kOcrGreen.withAlpha(80);
      iconColor = kOcrGreen;
      iconData = Icons.check_circle_rounded;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
      decoration: BoxDecoration(
        color: kOcrSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: kOcrMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Icon(iconData, color: iconColor, size: 16),
            ],
          ),
          TextField(
            controller: controller,
            keyboardType: _keyboardType(fieldKey),
            textCapitalization: _capitalization(fieldKey),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintText: _placeholder(fieldKey),
              hintStyle: const TextStyle(color: Color(0xFF4B5563), fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  static TextInputType _keyboardType(String key) => switch (key) {
        'engine_volume' || 'power_kw' || 'year' || 'owner_egn' => TextInputType.number,
        'first_registration_date' || 'registration_validity' => TextInputType.datetime,
        _ => TextInputType.text,
      };

  static TextCapitalization _capitalization(String key) => switch (key) {
        'license_plate' || 'vin' || 'cert_number' || 'make' || 'model' =>
          TextCapitalization.characters,
        'owner_name' || 'owner_address' || 'color' => TextCapitalization.words,
        _ => TextCapitalization.none,
      };

  static String _placeholder(String key) => switch (key) {
        'license_plate' => 'напр. СА1234АВ',
        'vin' => 'напр. WBA3A5G51DNP26082',
        'cert_number' => 'напр. 002345678',
        'make' => 'напр. BMW',
        'model' => 'напр. 320d',
        'year' => 'напр. 2019',
        'color' => 'напр. черен',
        'engine_volume' => 'напр. 1995',
        'power_kw' => 'напр. 140',
        'fuel_type' => 'напр. дизел',
        'seats' => 'напр. 5 или 4+1',
        'vehicle_category' => 'напр. M1',
        'euro_standard' => 'напр. EURO 6',
        'first_registration_date' => 'напр. 15.03.2019',
        'registration_validity' => 'напр. 31.12.2026',
        'owner_name' => 'напр. Иванов Иван',
        'owner_egn' => 'напр. 8501011234',
        'owner_address' => 'напр. гр. София, ул. Раковски 1',
        _ => 'Въведете ръчно…',
      };
}

// ─── Debug section ─────────────────────────────────────────────────────────────

class _DebugSection extends StatelessWidget {
  const _DebugSection({required this.fields, this.rawText, this.debugImages});
  final Map<String, OcrField> fields;
  final String? rawText;
  final List<String>? debugImages;

  static const _legendCodes = <String, String>{
    'A': '(A) Регистрационен номер',
    'E': '(E) VIN / Рамен номер',
    'D.1': '(D.1) Марка',
    'D.3': '(D.3) Търговско наименование',
    'B': '(B) Първа регистрация',
    'I': '(I) Дата на регистрация',
    'J': '(J) Категория МПС',
    'R': '(R) Цвят',
    'P.1': '(P.1) Работен обем (cc)',
    'P.2': '(P.2) Мощност (kW)',
    'P.3': '(P.3) Вид гориво',
    'S.1': '(S.1) Брой места',
    'V.9': '(V.9) EURO ниво',
    'C.2.1': '(C.2.1) Фамилия',
    'C.2.2': '(C.2.2) Собствено',
    'C.2.3': '(C.2.3) Адрес',
  };

  String? _toFieldKey(String code) => switch (code) {
        'A' => 'license_plate',
        'E' => 'vin',
        'D.1' || 'D.3' => 'make',
        'B' => 'first_registration_date',
        'I' => 'registration_validity',
        'J' => 'vehicle_category',
        'R' => 'color',
        'P.1' => 'engine_volume',
        'P.2' => 'power_kw',
        'P.3' => 'fuel_type',
        'S.1' => 'seats',
        'V.9' => 'euro_standard',
        'C.2.1' || 'C.2.2' => 'owner_name',
        'C.2.3' => 'owner_address',
        _ => null,
      };

  String _buildMappingText() {
    final buf = StringBuffer();
    for (final e in _legendCodes.entries) {
      final f = _toFieldKey(e.key);
      final v = f != null ? fields[f] : null;
      if (v?.value != null) {
        buf.writeln(
          '${e.value} → ${v!.value!} (${(v.confidence * 100).toStringAsFixed(0)}%)',
        );
      } else {
        buf.writeln('${e.value} → не е разпознато');
      }
    }
    return buf.toString().trimRight();
  }

  bool get _hasDebugImages =>
      debugImages != null && debugImages!.any((s) => s.isNotEmpty);

  Widget _buildDebugImagesSection() {
    final images = debugImages!;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0D1117),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kOcrBlue.withAlpha(80)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '🔬 Tesseract input (preprocessed)',
            style: TextStyle(
              color: kOcrBlue,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (int i = 0; i < images.length; i++)
                if (images[i].isNotEmpty)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: i < images.length - 1 ? 8 : 0),
                      child: Column(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.memory(
                              base64Decode(images[i]),
                              fit: BoxFit.cover,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Стъпка ${i + 1}',
                            style: const TextStyle(
                              color: kOcrMuted,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context, String text, String label) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$label копиран'),
          duration: const Duration(seconds: 2),
          backgroundColor: kOcrSurface,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Parsed fields
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.amber.withAlpha(20),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.amber.withAlpha(80)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '🔍 Разпознати полета (TalonParser)',
                      style: TextStyle(
                        color: Colors.amber,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => _copy(context, _buildMappingText(), 'Mapping'),
                    icon: const Icon(Icons.copy_rounded, size: 18, color: Colors.amber),
                    padding: const EdgeInsets.all(8),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ..._legendCodes.entries.map((e) {
                final f = _toFieldKey(e.key);
                final field = f != null ? fields[f] : null;
                final hasValue = field?.value != null;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        e.value,
                        style: TextStyle(
                          color: hasValue ? Colors.greenAccent : kOcrMuted,
                          fontSize: 11,
                          fontWeight: hasValue ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                      if (hasValue) ...[
                        const Text(' → ', style: TextStyle(color: kOcrMuted, fontSize: 11)),
                        Expanded(
                          child: Text(
                            field!.value!,
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          ' ${(field.confidence * 100).toStringAsFixed(0)}%',
                          style: const TextStyle(color: Colors.greenAccent, fontSize: 10),
                        ),
                      ] else
                        const Expanded(
                          child: Text(
                            ' — не е разпознато',
                            style: TextStyle(color: kOcrMuted, fontSize: 11),
                          ),
                        ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Raw OCR text
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0D1117),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '📄 Raw OCR текст',
                      style: TextStyle(
                        color: kOcrMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (rawText?.isNotEmpty == true)
                    IconButton(
                      onPressed: () => _copy(context, rawText!, 'Raw текст'),
                      icon: const Icon(Icons.copy_rounded, size: 18, color: kOcrTextSub),
                      padding: const EdgeInsets.all(8),
                      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                rawText?.isNotEmpty == true ? rawText! : '(нищо не е разпознато)',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
        if (_hasDebugImages) ...[
          const SizedBox(height: 12),
          _buildDebugImagesSection(),
        ],
      ],
    );
  }
}
