import 'dart:async';
import 'package:flutter/material.dart';
import '../data/models/catalog_make_model.dart';

const _kSurface = Color(0xFF1A1A2E);
const _kIndigo = Color(0xFF6366F1);
const _kMuted = Color(0xFF64748B);

// ─── Generic search bottom sheet ───────────────────────────────────────────────

class CatalogSearchSheet<T> extends StatefulWidget {
  const CatalogSearchSheet({
    super.key,
    required this.title,
    required this.initialQuery,
    required this.loadItems,
    required this.labelOf,
    this.sublabelOf,
  });

  final String title;
  final String initialQuery;
  final Future<List<T>> Function(String q) loadItems;
  final String Function(T) labelOf;
  final String? Function(T)? sublabelOf;

  @override
  State<CatalogSearchSheet<T>> createState() => _CatalogSearchSheetState<T>();
}

class _CatalogSearchSheetState<T> extends State<CatalogSearchSheet<T>> {
  late final TextEditingController _search;
  Timer? _debounce;
  List<T> _items = [];
  bool _loading = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _search = TextEditingController(text: widget.initialQuery);
    _search.addListener(_onSearchChanged);
    _loadItems(widget.initialQuery);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.removeListener(_onSearchChanged);
    _search.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _loadItems(_search.text);
    });
  }

  Future<void> _loadItems(String q) async {
    setState(() { _loading = true; _hasError = false; });
    try {
      final items = await widget.loadItems(q);
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _hasError = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (_, scrollCtrl) => Column(
        children: [
          _handle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Column(
              children: [
                Text(
                  widget.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _search,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Търсене...',
                    hintStyle: const TextStyle(color: _kMuted),
                    prefixIcon:
                        const Icon(Icons.search, color: _kMuted, size: 20),
                    filled: true,
                    fillColor: _kSurface,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: _kIndigo))
                : _hasError
                    ? const Center(
                        child: Text('Грешка при зареждане. Опитайте отново.',
                            style: TextStyle(color: Colors.redAccent),
                            textAlign: TextAlign.center))
                    : _items.isEmpty
                        ? const Center(
                            child: Text('Няма резултати',
                                style: TextStyle(color: _kMuted)))
                        : ListView.builder(
                            controller: scrollCtrl,
                            itemCount: _items.length,
                            itemBuilder: (_, i) {
                              final item = _items[i];
                              final sub = widget.sublabelOf?.call(item);
                              return ListTile(
                                title: Text(
                                  widget.labelOf(item),
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 14),
                                ),
                                subtitle: sub != null
                                    ? Text(sub,
                                        style: const TextStyle(
                                            color: _kMuted, fontSize: 12))
                                    : null,
                                trailing: const Icon(
                                    Icons.arrow_forward_ios_rounded,
                                    size: 14,
                                    color: _kMuted),
                                onTap: () => Navigator.of(context).pop(item),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  Widget _handle() => Container(
        margin: const EdgeInsets.only(top: 12, bottom: 8),
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: Colors.white24,
          borderRadius: BorderRadius.circular(2),
        ),
      );
}

// ─── Modification list sheet (with search filter) ─────────────────────────────

class ModificationListSheet extends StatefulWidget {
  const ModificationListSheet({
    super.key,
    required this.title,
    required this.items,
    this.initialQuery = '',
  });

  final String title;
  final List<CatalogModification> items;
  final String initialQuery;

  @override
  State<ModificationListSheet> createState() => _ModificationListSheetState();
}

class _ModificationListSheetState extends State<ModificationListSheet> {
  late final TextEditingController _search;
  late List<CatalogModification> _filtered;

  @override
  void initState() {
    super.initState();
    _search = TextEditingController(text: widget.initialQuery);
    _filtered = _filter(widget.initialQuery);
    _search.addListener(_onChanged);
  }

  @override
  void dispose() {
    _search.removeListener(_onChanged);
    _search.dispose();
    super.dispose();
  }

  void _onChanged() => setState(() => _filtered = _filter(_search.text));

  List<CatalogModification> _filter(String q) {
    if (q.isEmpty) return widget.items;
    final lower = q.toLowerCase();
    return widget.items
        .where((m) => m.name.toLowerCase().contains(lower))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, scrollCtrl) => Column(
        children: [
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Column(
              children: [
                Text(
                  widget.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _search,
                  autofocus: widget.initialQuery.isEmpty,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Търсене...',
                    hintStyle: const TextStyle(color: _kMuted),
                    prefixIcon:
                        const Icon(Icons.search, color: _kMuted, size: 20),
                    filled: true,
                    fillColor: _kSurface,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _filtered.isEmpty
                ? const Center(
                    child: Text('Няма налични модификации',
                        style: TextStyle(color: _kMuted)))
                : ListView.builder(
                    controller: scrollCtrl,
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final mod = _filtered[i];
                      final yearStr = mod.yearFrom != null
                          ? ' (${mod.yearFrom}–${mod.yearTo ?? '...'})'
                          : '';
                      final specs = [
                        if (mod.engineSizeCc != null) '${mod.engineSizeCc} cc',
                        if (mod.powerKw != null) '${mod.powerKw} kW',
                        if (mod.engineType != null) mod.engineType!,
                      ].join(' · ');
                      return ListTile(
                        title: Text(
                          mod.name,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13),
                        ),
                        subtitle: Text(
                          specs.isNotEmpty ? '$specs$yearStr' : yearStr,
                          style: const TextStyle(
                              color: _kMuted, fontSize: 11),
                        ),
                        onTap: () => Navigator.of(context).pop(mod),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
