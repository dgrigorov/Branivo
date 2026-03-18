import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/auth_bloc.dart';

class TwoFAScreen extends StatefulWidget {
  const TwoFAScreen({super.key, required this.tempToken});

  final String tempToken;

  @override
  State<TwoFAScreen> createState() => _TwoFAScreenState();
}

class _TwoFAScreenState extends State<TwoFAScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    context.read<AuthBloc>().add(
          TwoFAVerifyRequestedEvent(
            tempToken: widget.tempToken,
            otpCode: _codeController.text.trim(),
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: _handleStateChange,
      child: Scaffold(
        appBar: AppBar(title: const Text('Two-Factor Authentication')),
        body: SafeArea(child: _buildBody(context)),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        return Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildDescription(),
                  const SizedBox(height: 24),
                  if (state is AuthErrorState) _buildError(state.message),
                  _buildForm(state),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildDescription() => const Text(
        'Enter the 6-digit code from your authenticator app.',
        style: TextStyle(fontSize: 16, color: Colors.black54),
      );

  Widget _buildError(String message) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.red.shade300),
        ),
        child: Text(message, style: TextStyle(color: Colors.red.shade700, fontSize: 14)),
      );

  Widget _buildForm(AuthState state) => Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, letterSpacing: 8),
              decoration: const InputDecoration(
                labelText: 'Authentication code',
                hintText: '000000',
              ),
              onFieldSubmitted: (_) => _submit(),
              validator: (v) {
                if (v == null || v.length != 6) return 'Enter the 6-digit code';
                return null;
              },
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: state is AuthLoadingState ? null : _submit,
              child: state is AuthLoadingState
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Verify'),
            ),
          ],
        ),
      );

  void _handleStateChange(BuildContext context, AuthState state) {
    if (state is AuthAuthenticatedState) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    }
  }
}
