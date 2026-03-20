import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import '../bloc/payment_bloc.dart';
import '../bloc/payment_event.dart';
import '../bloc/payment_state.dart';

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

  Future<void> _confirmPayment(
    BuildContext context,
    String clientSecret,
  ) async {
    context.read<PaymentBloc>().add(const PaymentProcessingStartedEvent());

    try {
      await Stripe.instance.confirmPayment(
        paymentIntentClientSecret: clientSecret,
        data: const PaymentMethodParams.card(
          paymentMethodData: PaymentMethodData(),
        ),
      );
      // При успех → PaymentConfirmedEvent
      if (context.mounted) {
        context.read<PaymentBloc>().add(
              PaymentConfirmedEvent(paymentIntentId: clientSecret.split('_secret_').first),
            );
      }
    } on StripeException catch (e) {
      // e.error.localizedMessage → user-friendly съобщение
      if (context.mounted) {
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
      body: BlocBuilder<PaymentBloc, PaymentState>(
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
                  const SizedBox(height: 16),
                  CardFormField(
                    controller: CardFormEditController(),
                    style: CardFormStyle(
                      backgroundColor: Colors.white,
                      textColor: Colors.black87,
                      borderColor: Colors.grey.shade300,
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () => _confirmPayment(context, state.clientSecret),
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

          if (state is PaymentSuccessState) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check_circle_outline,
                        size: 64, color: Colors.green),
                    SizedBox(height: 16),
                    Text(
                      'Плащането е прието — полицата се обработва',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 18),
                    ),
                  ],
                ),
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
