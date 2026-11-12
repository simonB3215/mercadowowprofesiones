// Función de Vercel: todas las rutas /api/* llegan aquí (ver vercel.json).
import { handle } from '../src/server/router.js';

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
export async function PUT(req: Request) { return handle(req); }
export async function DELETE(req: Request) { return handle(req); }
