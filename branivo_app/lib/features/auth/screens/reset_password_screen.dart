import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../core/api/dio_client.dart';
import '../../../core/api/endpoints.dart';

const _kBgColor = Color(0xFFE0EAF0);
const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);
const _kBlueLight = Color(0xFF6CC4F5);

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  int _step = 1;
  final _identifierController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  String? _resetToken;
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _setError(String? error) => setState(() => _error = error);

  void _setLoading(bool loading) => setState(() => _isLoading = loading);

  Future<void> _sendOtp() async {
    final id = _identifierController.text.trim();
    if (id.isEmpty) return _setError('Въведи имейл или телефон');
    _setError(null);
    _setLoading(true);
    try {
      await DioClient.instance.post<void>(
        ApiEndpoints.passwordResetSendOtp,
        data: {'emailOrPhone': id},
      );
      setState(() => _step = 2);
    } on DioException catch (e) {
      _setError(_extractError(e, 'Грешка при изпращане на кода'));
    } finally {
      _setLoading(false);
    }
  }

  Future<void> _verifyOtp() async {
    final otp = _otpController.text.trim();
    if (otp.length != 6) return _setError('Въведи 6-цифрен код');
    _setError(null);
    _setLoading(true);
    try {
      final res = await DioClient.instance.post<Map<String, dynamic>>(
        ApiEndpoints.passwordResetVerifyOtp,
        data: {
          'emailOrPhone': _identifierController.text.trim(),
          'otp': otp,
        },
      );
      _resetToken = res.data?['reset_token'] as String?;
      setState(() => _step = 3);
    } on DioException catch (e) {
      _setError(_extractError(e, 'Невалиден код'));
    } finally {
      _setLoading(false);
    }
  }

  Future<void> _confirmReset() async {
    final pw = _passwordController.text;
    final confirm = _confirmController.text;
    if (pw.length < 8) return _setError('Паролата трябва да е поне 8 символа');
    if (pw != confirm) return _setError('Паролите не съвпадат');
    if (_resetToken == null) return _setError('Невалидна сесия');
    _setError(null);
    _setLoading(true);
    try {
      await DioClient.instance.post<void>(
        ApiEndpoints.passwordResetConfirm,
        data: {'token': _resetToken, 'newPassword': pw},
      );
      if (mounted) Navigator.of(context).pop();
    } on DioException catch (e) {
      _setError(_extractError(e, 'Грешка при смяна на паролата'));
    } finally {
      _setLoading(false);
    }
  }

  String _extractError(DioException e, String fallback) {
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      return data['message'] as String? ?? fallback;
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBgColor,
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() => SingleChildScrollView(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildTopBar(),
          const SizedBox(height: 40),
          _buildHeading(),
          const SizedBox(height: 24),
          if (_error != null) _buildError(_error!),
          _buildStepCard(),
        ],
      ),
    ),
  );

  Widget _buildTopBar() => Row(
    children: [
      GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(20),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: const Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 16,
            color: _kDarkCard,
          ),
        ),
      ),
    ],
  );

  Widget _buildHeading() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Забравена парола',
        style: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: _kDarkCard,
          height: 1.1,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        _stepSubtitle(),
        style: TextStyle(
          fontSize: 14,
          color: _kDarkCard.withAlpha(140),
          height: 1.5,
        ),
      ),
    ],
  );

  String _stepSubtitle() => switch (_step) {
    1 => 'Въведи имейл или телефон за да получиш код',
    2 => 'Въведи кода, изпратен на ${_identifierController.text.trim()}',
    _ => 'Въведи новата си парола',
  };

  Widget _buildError(String msg) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: Colors.red.shade50,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Colors.red.shade200),
    ),
    child: Row(
      children: [
        Icon(Icons.error_outline_rounded, color: Colors.red.shade400, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            msg,
            style: TextStyle(color: Colors.red.shade700, fontSize: 13),
          ),
        ),
      ],
    ),
  );

  Widget _buildStepCard() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withAlpha(15),
          blurRadius: 20,
          offset: const Offset(0, 4),
        ),
      ],
    ),
    child: switch (_step) {
      1 => _Step1Form(
          controller: _identifierController,
          isLoading: _isLoading,
          onSubmit: _sendOtp,
        ),
      2 => _Step2Form(
          controller: _otpController,
          isLoading: _isLoading,
          onSubmit: _verifyOtp,
        ),
      _ => _Step3Form(
          passwordController: _passwordController,
          confirmController: _confirmController,
          isLoading: _isLoading,
          onSubmit: _confirmReset,
        ),
    },
  );
}

// ─── Step widgets ─────────────────────────────────────────────────────────────

class _Step1Form extends StatelessWidget {
  const _Step1Form({
    required this.controller,
    required this.isLoading,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final bool isLoading;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ResetTextField(
          controller: controller,
          label: 'Имейл или телефон',
          icon: Icons.person_outline_rounded,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => onSubmit(),
        ),
        const SizedBox(height: 20),
        _ResetGradientButton(
          label: 'Изпрати код',
          isLoading: isLoading,
          onPressed: onSubmit,
        ),
      ],
    );
  }
}

class _Step2Form extends StatelessWidget {
  const _Step2Form({
    required this.controller,
    required this.isLoading,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final bool isLoading;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: controller,
          maxLength: 6,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            letterSpacing: 12,
            color: _kDarkCard,
          ),
          decoration: InputDecoration(
            labelText: '6-цифрен код',
            counterText: '',
            filled: true,
            fillColor: const Color(0xFFF5F8FC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: _kBlueMid, width: 1.5),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 20,
            ),
          ),
        ),
        const SizedBox(height: 20),
        _ResetGradientButton(
          label: 'Потвърди',
          isLoading: isLoading,
          onPressed: onSubmit,
        ),
      ],
    );
  }
}

class _Step3Form extends StatelessWidget {
  const _Step3Form({
    required this.passwordController,
    required this.confirmController,
    required this.isLoading,
    required this.onSubmit,
  });

  final TextEditingController passwordController;
  final TextEditingController confirmController;
  final bool isLoading;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ResetTextField(
          controller: passwordController,
          label: 'Нова парола',
          icon: Icons.lock_outline_rounded,
          obscureText: true,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 12),
        _ResetTextField(
          controller: confirmController,
          label: 'Потвърди паролата',
          icon: Icons.lock_outline_rounded,
          obscureText: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => onSubmit(),
        ),
        const SizedBox(height: 20),
        _ResetGradientButton(
          label: 'Запази',
          isLoading: isLoading,
          onPressed: onSubmit,
        ),
      ],
    );
  }
}

// ─── Shared form widgets ──────────────────────────────────────────────────────

class _ResetTextField extends StatelessWidget {
  const _ResetTextField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final void Function(String)? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      obscureText: obscureText,
      onFieldSubmitted: onSubmitted,
      style: const TextStyle(fontSize: 15, color: _kDarkCard),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20, color: _kBlueMid),
        filled: true,
        fillColor: const Color(0xFFF5F8FC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _kBlueMid, width: 1.5),
        ),
        labelStyle: const TextStyle(color: Colors.grey, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
    );
  }
}

class _ResetGradientButton extends StatelessWidget {
  const _ResetGradientButton({
    required this.label,
    required this.isLoading,
    required this.onPressed,
  });

  final String label;
  final bool isLoading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_kBlueLight, _kBlueMid],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: _kBlueMid.withAlpha(90),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: isLoading ? null : onPressed,
          child: Center(
            child: isLoading
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
