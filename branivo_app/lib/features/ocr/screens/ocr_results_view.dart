import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/widgets/app_toast.dart';
import '../../vehicle_catalog/data/models/catalog_make_model.dart';
import '../../vehicle_catalog/data/repositories/vehicle_catalog_repository.dart';
import '../../vehicle_catalog/widgets/vehicle_catalog_picker.dart';
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
    this.catalogRepository,
  });

  final Map<String, OcrField> fields;
  final void Function(Map<String, OcrField>) onProceed;
  final VoidCallback onManualEntry;
  final String? rawText;
  /// Base64 JPEG previews of what Tesseract actually processed, one per step.
  final List<String>? debugImages;
  /// When provided, make/model fields use the vehicle catalog picker.
  final VehicleCatalogRepository? catalogRepository;

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

  void _onCatalogSelection(VehicleCatalogSelection? selection) {
    if (selection == null) return;
    setState(() {
      _controllers['make']?.text = selection.makeName;
      _controllers['model']?.text = selection.modelName ?? '';
      _controllers['modification']?.text = selection.modificationName ?? '';
      if (selection.powerKw != null) {
        _controllers['power_kw']?.text = selection.powerKw.toString();
      }
      if (selection.engineSizeCc != null) {
        _controllers['engine_volume']?.text =
            selection.engineSizeCc.toString();
      }
      if (selection.engineType != null) {
        _controllers['fuel_type']?.text = selection.engineType!;
      }
    });
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
                  _buildSection(
                    icon: Icons.badge_outlined,
                    title: 'Документ',
                    keys: const ['license_plate', 'cert_number'],
                  ),
                  _buildSection(
                    icon: Icons.directions_car_rounded,
                    title: 'Марка / Модел',
                    keys: const [],
                    catalogSlot: widget.catalogRepository != null
                        ? _CatalogPickerCard(
                            repository: widget.catalogRepository!,
                            initialMakeText: widget.fields['make']?.value,
                            initialModelText: widget.fields['model']?.value,
                            initialModificationText: widget.fields['modification']?.value,
                            onChanged: _onCatalogSelection,
                          )
                        : null,
                    fallbackKeys: widget.catalogRepository == null
                        ? const ['make', 'model', 'modification']
                        : const [],
                  ),
                  _buildSection(
                    icon: Icons.settings_outlined,
                    title: 'Технически характеристики',
                    keys: const [
                      'year', 'color', 'engine_volume', 'power_kw',
                      'fuel_type', 'seats', 'vehicle_category', 'euro_standard',
                    ],
                  ),
                  _buildSection(
                    icon: Icons.calendar_today_outlined,
                    title: 'Регистрация',
                    keys: const [
                      'first_registration_date',
                      'registration_validity',
                    ],
                  ),
                  _buildSection(
                    icon: Icons.person_outline_rounded,
                    title: 'Собственик',
                    keys: const ['owner_name', 'owner_egn', 'owner_address'],
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            _buildProceedButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildSection({
    required IconData icon,
    required String title,
    required List<String> keys,
    Widget? catalogSlot,
    List<String> fallbackKeys = const [],
  }) {
    final allKeys = [...keys, ...fallbackKeys];
    final hasContent = catalogSlot != null ||
        allKeys.any((k) => _controllers[k]?.text.isNotEmpty == true ||
            widget.fields.containsKey(k));
    if (!hasContent) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF12122A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withAlpha(18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                Icon(icon, color: kOcrIndigo, size: 14),
                const SizedBox(width: 6),
                Text(
                  title.toUpperCase(),
                  style: const TextStyle(
                    color: kOcrIndigo,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
          ),
          if (catalogSlot != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: catalogSlot,
            ),
          for (final key in allKeys)
            if (_controllers.containsKey(key))
              _SectionFieldRow(
                label: kFieldLabels[key] ?? key,
                fieldKey: key,
                field: widget.fields[key],
                controller: _controllers[key]!,
              ),
          if (catalogSlot != null || allKeys.isNotEmpty)
            const SizedBox(height: 4),
        ],
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

// ─── Catalog picker card ───────────────────────────────────────────────────────

class _CatalogPickerCard extends StatelessWidget {
  const _CatalogPickerCard({
    required this.repository,
    required this.initialMakeText,
    required this.initialModelText,
    required this.initialModificationText,
    required this.onChanged,
  });

  final VehicleCatalogRepository repository;
  final String? initialMakeText;
  final String? initialModelText;
  final String? initialModificationText;
  final void Function(VehicleCatalogSelection?) onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      decoration: BoxDecoration(
        color: kOcrSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kOcrIndigo.withAlpha(80)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.directions_car_rounded,
                  color: kOcrIndigo, size: 14),
              const SizedBox(width: 6),
              const Text(
                'МАРКА / МОДЕЛ — от каталога',
                style: TextStyle(
                  color: kOcrIndigo,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          VehicleCatalogPicker(
            repository: repository,
            initialMakeText: initialMakeText,
            initialModelText: initialModelText,
            initialModificationText: initialModificationText,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

// ─── Section field row (used inside grouped sections) ─────────────────────────

class _SectionFieldRow extends StatelessWidget {
  const _SectionFieldRow({
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
      borderColor = Colors.red.withAlpha(80);
      iconColor = Colors.red.shade300;
      iconData = Icons.edit_outlined;
    } else if (isLow) {
      borderColor = Colors.amber.withAlpha(60);
      iconColor = Colors.amber;
      iconData = Icons.warning_amber_rounded;
    } else {
      borderColor = Colors.transparent;
      iconColor = kOcrGreen;
      iconData = Icons.check_circle_rounded;
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 8),
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
      decoration: BoxDecoration(
        color: kOcrSurface,
        borderRadius: BorderRadius.circular(8),
        border: borderColor == Colors.transparent ? null : Border.all(color: borderColor),
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
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Icon(iconData, color: iconColor, size: 14),
            ],
          ),
          TextField(
            controller: controller,
            keyboardType: _keyboardType(fieldKey),
            textCapitalization: _capitalization(fieldKey),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              border: InputBorder.none,
              filled: true,
              fillColor: Colors.transparent,
              contentPadding: EdgeInsets.zero,
              hintText: _placeholder(fieldKey),
              hintStyle: const TextStyle(color: Color(0xFF374151), fontSize: 13),
              isDense: true,
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
        'seats' => 'напр. 5',
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
            '🔬 Claude input (perspective-corrected)',
            style: TextStyle(
              color: kOcrBlue,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Column(
            children: [
              for (int i = 0; i < images.length; i++)
                if (images[i].isNotEmpty)
                  Padding(
                    padding: EdgeInsets.only(bottom: i < images.length - 1 ? 12 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            base64Decode(images[i]),
                            fit: BoxFit.contain,
                            width: double.infinity,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Стъпка ${i + 1}',
                          style: const TextStyle(
                            color: kOcrMuted,
                            fontSize: 10,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
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
      AppToast.success(context, '$label копиран');
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
