import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    context.read<AuthBloc>().add(
          LoginRequestedEvent(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: _handleStateChange,
      child: Scaffold(
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
                  _buildHeader(),
                  const SizedBox(height: 32),
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

  Widget _buildHeader() => const Text(
        'Sign in',
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
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
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Email'),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Email is required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              obscureText: true,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
              decoration: const InputDecoration(labelText: 'Password'),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Password is required' : null,
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
                  : const Text('Sign in'),
            ),
          ],
        ),
      );

  void _handleStateChange(BuildContext context, AuthState state) {
    if (state is AuthRequires2FAState) {
      context.push('/2fa', extra: state.tempToken);
    } else if (state is AuthAuthenticatedState) {
      context.go('/');
    }
  }
}
