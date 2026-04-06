import 'package:flutter/material.dart';
import '../../data/cookie_policy_service.dart';

class CookiePolicyScreen extends StatefulWidget {
  const CookiePolicyScreen({
    super.key,
    required this.cookiePolicyService,
    this.lang = 'bg',
  });

  final CookiePolicyService cookiePolicyService;
  final String lang;

  @override
  State<CookiePolicyScreen> createState() => _CookiePolicyScreenState();
}

class _CookiePolicyScreenState extends State<CookiePolicyScreen> {
  late Future<CookiePolicyData> _policyFuture;

  @override
  void initState() {
    super.initState();
    _policyFuture =
        widget.cookiePolicyService.fetchPublished(lang: widget.lang);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cookie Policy')),
      body: FutureBuilder<CookiePolicyData>(
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
                    Icon(Icons.info_outline,
                        size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 16),
                    const Text(
                      'Cookie Policy не е налична в момента.',
                      textAlign: TextAlign.center,
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
