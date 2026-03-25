import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/registration_bloc.dart';
import '../../../core/routing/auth_redirect.dart';

class RegistrationScreen extends StatelessWidget {
  const RegistrationScreen({super.key, this.sessionId, this.authRedirect});

  final String? sessionId;

  /// If set, navigates to [authRedirect.path] after successful registration
  /// instead of the default '/'.
  final AuthRedirect? authRedirect;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Регистрация / Вход')),
      body: BlocConsumer<RegistrationBloc, RegistrationState>(
        listener: (context, state) {
          if (state is RegistrationSuccessState) {
            final redirect = authRedirect;
            if (redirect != null) {
              context.go(redirect.path, extra: redirect.extra);
            } else {
              context.go('/');
            }
          }
        },
        builder: (context, state) {
          if (state is RegistrationInitialState || state is RegistrationErrorState) {
            final errorMsg =
                state is RegistrationErrorState ? state.message : null;
            return _PhoneEntryForm(errorMsg: errorMsg);
          }

          if (state is OtpSentState) {
            return _OtpEntryForm(
              expiresIn: state.expiresIn,
              phoneNumber: state.phoneNumber,
              sessionId: sessionId,
            );
          }

          if (state is OtpVerifyingState) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is OtpExpiredState) {
            return _PhoneEntryForm(
              errorMsg: 'Кодът изтече. Поискайте нов код.',
            );
          }

          if (state is RateLimitedState) {
            final minutes = (state.retryAfterSeconds / 60).ceil();
            return _PhoneEntryForm(
              errorMsg: 'Твърде много опити. Опитайте след $minutes минути.',
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }
}

class _PhoneEntryForm extends StatefulWidget {
  const _PhoneEntryForm({this.errorMsg});
  final String? errorMsg;

  @override
  State<_PhoneEntryForm> createState() => _PhoneEntryFormState();
}

class _PhoneEntryFormState extends State<_PhoneEntryForm> {
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _submit(BuildContext context) {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    context.read<RegistrationBloc>().add(RequestOtpEvent(phoneNumber: phone));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.errorMsg != null)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Text(
                widget.errorMsg!,
                style: TextStyle(color: Colors.red.shade700),
              ),
            ),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(
              labelText: 'Телефонен номер',
              hintText: '+359 88 123 456',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => _submit(context),
            child: const Text('Изпрати код'),
          ),
        ],
      ),
    );
  }
}

class _OtpEntryForm extends StatefulWidget {
  const _OtpEntryForm({
    required this.expiresIn,
    required this.phoneNumber,
    this.sessionId,
  });
  final int expiresIn;
  final String phoneNumber;
  final String? sessionId;

  @override
  State<_OtpEntryForm> createState() => _OtpEntryFormState();
}

class _OtpEntryFormState extends State<_OtpEntryForm> {
  final _otpController = TextEditingController();
  late int _secondsLeft;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.expiresIn;
    _otpController.addListener(() => setState(() {}));
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_secondsLeft <= 0) {
        _timer?.cancel();
        return;
      }
      setState(() => _secondsLeft--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _otpController.dispose();
    super.dispose();
  }

  String get _timerLabel {
    final mins = _secondsLeft ~/ 60;
    final secs = (_secondsLeft % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  void _submit(BuildContext context) {
    final otp = _otpController.text.trim();
    if (otp.length != 6) return;
    context.read<RegistrationBloc>().add(
          VerifyOtpEvent(
            phoneNumber: widget.phoneNumber,
            otpCode: otp,
            sessionId: widget.sessionId,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Валиден $_timerLabel мин.',
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _otpController,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, letterSpacing: 8),
            decoration: const InputDecoration(
              labelText: 'Код от SMS',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _otpController.text.length == 6
                ? () => _submit(context)
                : null,
            child: const Text('Потвърди'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () {
              context.read<RegistrationBloc>().add(
                    ResendOtpEvent(phoneNumber: widget.phoneNumber),
                  );
            },
            child: const Text('Изпрати нов код'),
          ),
        ],
      ),
    );
  }
}
