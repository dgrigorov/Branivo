import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../data/tos_service.dart';

class TosScreen extends StatefulWidget {
  const TosScreen({
    super.key,
    required this.tosService,
    this.lang = 'bg',
  });

  final TosService tosService;
  final String lang;

  @override
  State<TosScreen> createState() => _TosScreenState();
}

class _TosScreenState extends State<TosScreen> {
  late Future<TosVersionData> _tosFuture;

  @override
  void initState() {
    super.initState();
    _tosFuture = widget.tosService.fetchPublished(lang: widget.lang);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Общи Условия')),
      body: FutureBuilder<TosVersionData>(
        future: _tosFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline,
                        size: 48, color: Colors.red.shade400),
                    const SizedBox(height: 16),
                    Text(
                      'Общите Условия не са достъпни в момента.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () {
                        setState(() {
                          _tosFuture = widget.tosService
                              .fetchPublished(lang: widget.lang);
                        });
                      },
                      icon: const Icon(Icons.refresh),
                      label: const Text('Опитай отново'),
                    ),
                  ],
                ),
              ),
            );
          }
          final tos = snapshot.data!;
          return Markdown(
            data: tos.content,
            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
          );
        },
      ),
    );
  }
}
