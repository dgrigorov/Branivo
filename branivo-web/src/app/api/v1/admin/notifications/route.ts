import { NextResponse } from 'next/server';

const mockNotifications = [
  {
    id: 'notif-001',
    adminId: 'admin-001',
    target: 'all',
    type: 'info',
    message: 'Платформата ще бъде на техническа поддръжка на 25 март от 02:00 до 04:00.',
    dismissible: true,
    isActive: true,
    sentAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'notif-002',
    adminId: 'admin-001',
    target: 'aaaaaaaa-0000-0000-0000-000000000001',
    type: 'warning',
    message: 'Вашият Stripe акаунт изисква верификация.',
    dismissible: false,
    isActive: false,
    sentAt: new Date(Date.now() - 86400_000).toISOString(),
  },
];

export async function GET() {
  return NextResponse.json(mockNotifications);
}

export async function POST(request: Request) {
  const body = await request.json() as { message: string; type: string; tenantId?: string };
  const created = {
    id: `notif-${Date.now()}`,
    adminId: 'admin-001',
    target: body.tenantId ?? 'all',
    type: body.type,
    message: body.message,
    dismissible: true,
    isActive: true,
    sentAt: new Date().toISOString(),
  };
  return NextResponse.json(created, { status: 201 });
}
