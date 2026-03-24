import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';
import '../bloc/payment_bloc.dart';
import '../bloc/payment_event.dart';
import '../bloc/payment_state.dart';
import 'policy_confirmation_screen.dart';

class PaymentRouteArgs {
  final String quoteId;
  final String insurerName;
  final double amount;
  final String currency;

  const PaymentRouteArgs({
    required this.quoteId,
    required this.insurerName,
    required this.amount,
    required this.currency,
  });
}

class PaymentScreen extends StatefulWidget {
  final String quoteId;
  final String insurerName;
  final double amount;
  final String currency;

  const PaymentScreen({
    super.key,
    required this.quoteId,
    required this.insurerName,
    required this.amount,
    required this.currency,
  });

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  @override
  void initState() {
    super.initState();
    context.read<PaymentBloc>().add(
          PaymentIntentRequestedEvent(quoteId: widget.quoteId),
        );
  }

  Future<void> _presentPaymentSheet(
    BuildContext context,
    String clientSecret,
  ) async {
    context.read<PaymentBloc>().add(const PaymentProcessingStartedEvent());

    try {
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Branivo',
          returnURL: 'branivo://stripe-redirect',
          // v12+: merchantCountryCode is inside the object (breaking change from v10)
          applePay: const PaymentSheetApplePay(
            merchantCountryCode: 'BG',
          ),
          // v12+: merchantCountryCode, currencyCode, testEnv are inside the object
          googlePay: PaymentSheetGooglePay(
            merchantCountryCode: 'BG',
            currencyCode: 'BGN',
            testEnv: !kReleaseMode,
          ),
          style: ThemeMode.system,
          primaryButtonLabel: 'Плати сега',
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      // Success — НЕ активираме полицата тук; активацията е САМО в StripeWebhookService
      if (context.mounted) {
        context.read<PaymentBloc>().add(
              PaymentConfirmedEvent(
                paymentIntentId: clientSecret.split('_secret_').first,
              ),
            );
      }
    } on StripeException catch (e) {
      if (!context.mounted) return;

      if (e.error.code == FailureCode.Canceled) {
        // User closed PaymentSheet without completing payment — AC6: emit PaymentReadyState
        context.read<PaymentBloc>().add(const PaymentCanceledEvent());
      } else {
        context.read<PaymentBloc>().add(
              PaymentFailedEvent(
                errorMessage:
                    e.error.localizedMessage ?? 'Неуспешно плащане. Моля, опитайте отново.',
              ),
            );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Плащане — ${widget.insurerName}'),
      ),
      body: BlocConsumer<PaymentBloc, PaymentState>(
        listener: (context, state) {
          if (state is PaymentSuccessState) {
            context.go(
              '/policy-confirmation',
              extra: PolicyConfirmationRouteArgs(
                insurerName: widget.insurerName,
                amount: widget.amount,
                currency: widget.currency,
                paymentIntentId: state.paymentIntentId,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is PaymentLoadingState) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is PaymentReadyState) {
            return Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Сума: ${state.amount.toStringAsFixed(2)} ${state.currency}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () =>
                        _presentPaymentSheet(context, state.clientSecret),
                    child: const Text('Плати'),
                  ),
                ],
              ),
            );
          }

          if (state is PaymentProcessingState) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Обработва се плащането...'),
                ],
              ),
            );
          }

          if (state is PaymentFailedState) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 64, color: Colors.red),
                    const SizedBox(height: 16),
                    Text(
                      state.message,
                      textAlign: TextAlign.center,
                    ),
                    if (state.canRetry) ...[
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: () {
                          context
                              .read<PaymentBloc>()
                              .add(const PaymentRetryRequestedEvent());
                        },
                        child: const Text('Опитай отново'),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }
}
