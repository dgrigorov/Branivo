import 'package:flutter/material.dart';
import '../../data/tos_service.dart';

/// Fullscreen screen that forces the user to accept the current ToS.
/// Cannot be dismissed without accepting — back navigation is blocked.
class TosAcceptanceScreen extends StatefulWidget {
  const TosAcceptanceScreen({
    super.key,
    required this.tosService,
    required this.tosVersion,
    required this.onAccepted,
  });

  final TosService tosService;
  final TosVersionData tosVersion;

  /// Called after the user successfully accepts the ToS.
  final VoidCallback onAccepted;

  @override
  State<TosAcceptanceScreen> createState() => _TosAcceptanceScreenState();
}

class _TosAcceptanceScreenState extends State<TosAcceptanceScreen> {
  bool _isAccepting = false;
  String? _errorMessage;

  Future<void> _accept() async {
    setState(() {
      _isAccepting = true;
      _errorMessage = null;
    });

    try {
      await widget.tosService.accept(tosVersionId: widget.tosVersion.id);
      if (mounted) {
        setState(() => _isAccepting = false);
        widget.onAccepted();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isAccepting = false;
          _errorMessage =
              'Не можахме да запишем приемането. Моля, опитайте отново.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Общи Условия'),
          automaticallyImplyLeading: false,
        ),
        body: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Версия ${widget.tosVersion.version}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                    ),
                    const SizedBox(height: 12),
                    SelectableText(
                      widget.tosVersion.content,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
            if (_errorMessage != null)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Text(
                  _errorMessage!,
                  style: TextStyle(color: Colors.red.shade700),
                  textAlign: TextAlign.center,
                ),
              ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isAccepting ? null : _accept,
                    child: _isAccepting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Прочетох и приемам Общите Условия'),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
