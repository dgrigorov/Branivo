import 'package:flutter/material.dart';
import '../data/models/catalog_make_model.dart';
import '../data/repositories/vehicle_catalog_repository.dart';
import 'catalog_search_sheet.dart';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const _kSurface = Color(0xFF1A1A2E);
const _kIndigo = Color(0xFF6366F1);
const _kMuted = Color(0xFF64748B);

class VehicleCatalogPicker extends StatefulWidget {
  const VehicleCatalogPicker({
    super.key,
    required this.repository,
    this.initialMakeText,
    this.initialModelText,
    this.initialModificationText,
    required this.onChanged,
    this.showModifications = true,
  });

  final VehicleCatalogRepository repository;
  final String? initialMakeText;
  final String? initialModelText;
  final String? initialModificationText;
  final void Function(VehicleCatalogSelection?) onChanged;
  final bool showModifications;

  @override
  State<VehicleCatalogPicker> createState() => _VehicleCatalogPickerState();
}

class _VehicleCatalogPickerState extends State<VehicleCatalogPicker> {
  CatalogMake? _make;
  CatalogVehicleModel? _model;
  CatalogModification? _modification;

  @override
  void initState() {
    super.initState();
    _autoPopulate();
  }

  Future<void> _autoPopulate() async {
    final makeText = widget.initialMakeText;
    if (makeText == null || makeText.isEmpty) return;

    try {
      // 1. Search make — take first exact or best match
      final makes = await widget.repository.searchMakes(q: makeText);
      if (makes.isEmpty || !mounted) return;

      final make = _bestMatch(makes, (m) => m.name, makeText) ?? makes.first;
      if (!mounted) return;
      setState(() => _make = make);

      widget.onChanged(VehicleCatalogSelection(
        makeId: make.id,
        makeName: make.name,
      ));

      // 2. Search model using initialModelText
      final modelText = widget.initialModelText;
      if (modelText == null || modelText.isEmpty) return;

      final models =
          await widget.repository.searchModels(make.id, q: modelText);
      if (models.isEmpty || !mounted) return;

      final model =
          _bestMatch(models, (m) => m.name, modelText) ?? models.first;
      if (!mounted) return;
      setState(() => _model = model);

      widget.onChanged(VehicleCatalogSelection(
        makeId: make.id,
        makeName: make.name,
        modelId: model.id,
        modelName: model.name,
        yearFrom: model.yearFrom,
        yearTo: model.yearTo,
      ));

      // 3. Try to pre-select modification using initialModificationText
      final modText = widget.initialModificationText;
      if (modText == null || modText.isEmpty) return;

      final mods = await widget.repository.getModifications(model.id);
      if (mods.isEmpty || !mounted) return;

      final mod = _bestMatch(mods, (m) => m.name, modText);
      if (mod == null || !mounted) return;
      setState(() => _modification = mod);

      widget.onChanged(VehicleCatalogSelection(
        makeId: make.id,
        makeName: make.name,
        modelId: model.id,
        modelName: model.name,
        modificationId: mod.id,
        modificationName: mod.name,
        yearFrom: mod.yearFrom,
        yearTo: mod.yearTo,
        engineType: mod.engineType,
        engineSizeCc: mod.engineSizeCc,
        powerKw: mod.powerKw,
      ));
    } catch (_) {
      // Auto-populate is best-effort: silently ignore network/parse errors.
      // The user can still manually select make/model/modification.
    }
  }

  /// Returns the item whose label best matches [query] (case-insensitive).
  /// Priority: exact → starts-with → contains.
  static T? _bestMatch<T>(
    List<T> items,
    String Function(T) label,
    String query,
  ) {
    final q = query.toLowerCase();
    T? startsWith;
    T? contains;
    for (final item in items) {
      final l = label(item).toLowerCase();
      if (l == q) return item; // exact
      if (startsWith == null && l.startsWith(q)) startsWith = item;
      if (contains == null && l.contains(q)) contains = item;
    }
    return startsWith ?? contains;
  }

  Future<void> _pickMake() async {
    final selected = await showModalBottomSheet<CatalogMake>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0A0A0A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CatalogSearchSheet<CatalogMake>(
        title: 'Изберете марка',
        initialQuery: _make?.name ?? widget.initialMakeText ?? '',
        loadItems: (q) => widget.repository.searchMakes(q: q),
        labelOf: (m) => m.name,
      ),
    );
    if (selected != null && selected.id != _make?.id) {
      setState(() {
        _make = selected;
        _model = null;
        _modification = null;
      });
      widget.onChanged(VehicleCatalogSelection(
        makeId: selected.id,
        makeName: selected.name,
      ));
    }
  }

  Future<void> _pickModel() async {
    final make = _make;
    if (make == null) return;
    final selected = await showModalBottomSheet<CatalogVehicleModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0A0A0A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CatalogSearchSheet<CatalogVehicleModel>(
        title: 'Изберете модел',
        initialQuery: _model?.name ?? widget.initialModelText ?? '',
        loadItems: (q) => widget.repository.searchModels(make.id, q: q),
        labelOf: (m) => m.name,
        sublabelOf: (m) {
          if (m.yearFrom != null && m.yearTo != null) {
            return '${m.yearFrom} – ${m.yearTo}';
          }
          if (m.yearFrom != null) return 'от ${m.yearFrom}';
          return null;
        },
      ),
    );
    if (selected != null && selected.id != _model?.id) {
      setState(() {
        _model = selected;
        _modification = null;
      });
      widget.onChanged(VehicleCatalogSelection(
        makeId: make.id,
        makeName: make.name,
        modelId: selected.id,
        modelName: selected.name,
        yearFrom: selected.yearFrom,
        yearTo: selected.yearTo,
      ));
    }
  }

  Future<void> _pickModification() async {
    final make = _make;
    final model = _model;
    if (make == null || model == null) return;
    final mods = await widget.repository.getModifications(model.id);
    if (!mounted) return;
    final selected = await showModalBottomSheet<CatalogModification>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0A0A0A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ModificationListSheet(
        title: 'Изберете модификация',
        items: mods,
        initialQuery: _modification == null
            ? (widget.initialModificationText ?? '')
            : _modification!.name,
      ),
    );
    if (selected != null) {
      setState(() => _modification = selected);
      widget.onChanged(VehicleCatalogSelection(
        makeId: make.id,
        makeName: make.name,
        modelId: model.id,
        modelName: model.name,
        modificationId: selected.id,
        modificationName: selected.name,
        yearFrom: selected.yearFrom,
        yearTo: selected.yearTo,
        engineType: selected.engineType,
        engineSizeCc: selected.engineSizeCc,
        powerKw: selected.powerKw,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _PickerField(
          label: 'Марка',
          value: _make?.name ?? widget.initialMakeText,
          hint: 'Изберете марка',
          onTap: _pickMake,
          isSelected: _make != null,
        ),
        const SizedBox(height: 10),
        _PickerField(
          label: 'Модел',
          value: _model?.name,
          hint: _make != null ? 'Изберете модел' : 'Изберете марка първо',
          onTap: _make != null ? _pickModel : null,
          isSelected: _model != null,
        ),
        if (widget.showModifications) ...[
          const SizedBox(height: 10),
          _PickerField(
            label: 'Модификация',
            value: _modification?.name,
            hint: _model != null
                ? 'Изберете модификация'
                : 'Изберете модел първо',
            onTap: _model != null ? _pickModification : null,
            isSelected: _modification != null,
          ),
        ],
      ],
    );
  }
}

// ─── Picker field ──────────────────────────────────────────────────────────────

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.label,
    required this.value,
    required this.hint,
    required this.onTap,
    required this.isSelected,
  });

  final String label;
  final String? value;
  final String hint;
  final VoidCallback? onTap;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected
                ? _kIndigo.withAlpha(180)
                : enabled
                    ? const Color(0xFF374151)
                    : const Color(0xFF1F2937),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: enabled ? _kMuted : _kMuted.withAlpha(120),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value ?? hint,
                    style: TextStyle(
                      color: value != null
                          ? Colors.white
                          : const Color(0xFF374151),
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              isSelected
                  ? Icons.check_circle_rounded
                  : Icons.arrow_drop_down_rounded,
              color: isSelected ? _kIndigo : _kMuted,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}
