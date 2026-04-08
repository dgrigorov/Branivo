import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/dio_client.dart';

/// Shown to Google OAuth users before their first purchase.
/// КФН requirement: phone verification is mandatory before policy issuance.
class PhoneVerificationDialog extends StatefulWidget {
  const PhoneVerificationDialog({super.key});

  @override
  State<PhoneVerificationDialog> createState() =>
      _PhoneVerificationDialogState();
}

class _PhoneVerificationDialogState extends State<PhoneVerificationDialog> {
  static const _storage = FlutterSecureStorage();

  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();

  bool _otpSent = false;
  bool _loading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _errorMessage = 'Въведете телефонен номер.');
      return;
    }
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await DioClient.instance.post<Map<String, dynamic>>(
        '/api/v1/auth/client/phone/request-otp',
        data: {'phone_number': phone},
      );
      setState(() => _otpSent = true);
    } on DioException catch (e) {
      final msg = _extractError(e);
      setState(() => _errorMessage = msg);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _phoneController.text.trim();
    final otp = _otpController.text.trim();
    if (otp.length != 6) {
      setState(() => _errorMessage = 'Въведете 6-цифрен код.');
      return;
    }
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await DioClient.instance.post<Map<String, dynamic>>(
        '/api/v1/auth/client/phone/verify',
        data: {'phone_number': phone, 'otp_code': otp},
      );
      await _storage.write(key: 'phone_verified', value: 'true');
      if (mounted) Navigator.of(context).pop(true);
    } on DioException catch (e) {
      final msg = _extractError(e);
      setState(() => _errorMessage = msg);
    } finally {
      setState(() => _loading = false);
    }
  }

  String _extractError(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final msg = data['message'];
      if (msg is String) return msg;
    }
    return 'Грешка. Моля, опитайте отново.';
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Добавете телефон'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'За да купите полица, КФН изисква верифициран телефонен номер.',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              enabled: !_otpSent,
              decoration: const InputDecoration(
                labelText: 'Телефонен номер',
                hintText: '+359 88 123 4567',
                border: OutlineInputBorder(),
              ),
            ),
            if (_otpSent) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                  labelText: '6-цифрен код',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            if (_errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                _errorMessage!,
                style: const TextStyle(color: Colors.red, fontSize: 13),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(false),
          child: const Text('Отказ'),
        ),
        if (!_otpSent)
          ElevatedButton(
            onPressed: _loading ? null : _requestOtp,
            child: _loading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Изпрати код'),
          )
        else
          ElevatedButton(
            onPressed: _loading ? null : _verifyOtp,
            child: _loading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Потвърди'),
          ),
      ],
    );
  }
}
