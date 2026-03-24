import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ message: 'Invitation sent' }, { status: 201 });
}
