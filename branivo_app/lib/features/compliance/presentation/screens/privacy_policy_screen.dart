import 'package:flutter/material.dart';
import '../../data/privacy_policy_service.dart';

class PrivacyPolicyScreen extends StatefulWidget {
  const PrivacyPolicyScreen({
    super.key,
    required this.privacyPolicyService,
    this.lang = 'bg',
  });

  final PrivacyPolicyService privacyPolicyService;
  final String lang;

  @override
  State<PrivacyPolicyScreen> createState() => _PrivacyPolicyScreenState();
}

class _PrivacyPolicyScreenState extends State<PrivacyPolicyScreen> {
  late Future<PrivacyPolicyData> _policyFuture;

  @override
  void initState() {
    super.initState();
    _policyFuture =
        widget.privacyPolicyService.fetchPublished(lang: widget.lang);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Политика за поверителност')),
      body: FutureBuilder<PrivacyPolicyData>(
        future: _policyFuture,
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
                      'Политиката за поверителност не е достъпна в момента.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () {
                        setState(() {
                          _policyFuture = widget.privacyPolicyService
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
          final policy = snapshot.data!;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: SelectableText(
              policy.content,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          );
        },
      ),
    );
  }
}
