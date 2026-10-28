import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailSpy } = vi.hoisted(() => ({ sendMailSpy: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import { resetMailTransport, sendMail } from './transport';

describe('sendMail con adjuntos', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', 'smtp.test');
    resetMailTransport();
    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMailTransport();
  });

  it('pasa los adjuntos a nodemailer', async () => {
    const content = new Uint8Array([37, 80, 68, 70]);
    const ok = await sendMail({
      to: 'proveedor@test.com',
      subject: 'OC',
      text: 'adjunta',
      attachments: [{ filename: 'OC-000001.pdf', content, contentType: 'application/pdf' }],
    });

    expect(ok).toBe(true);
    const [message] = sendMailSpy.mock.calls[0];
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].filename).toBe('OC-000001.pdf');
    expect(message.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(message.attachments[0].content)).toBe(true);
    expect([...message.attachments[0].content]).toEqual([37, 80, 68, 70]);
  });

  it('sin adjuntos no manda la clave', async () => {
    await sendMail({ to: 'a@test.com', subject: 'x', text: 'y' });
    const [message] = sendMailSpy.mock.calls[0];
    expect(message.attachments).toBeUndefined();
  });
});

describe('sendMail con MAIL_ALLOWED_DOMAINS', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', 'smtp.test');
    resetMailTransport();
    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMailTransport();
  });

  it('sin la variable envía a cualquier dominio', async () => {
    expect(await sendMail({ to: 'a@cualquiera.com', subject: 'x', text: 'y' })).toBe(true);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
  });

  it('con la variable descarta los destinatarios de otros dominios', async () => {
    vi.stubEnv('MAIL_ALLOWED_DOMAINS', 'codecontrol.com.ar, Ejemplo.COM');
    const ok = await sendMail({
      to: ['ok@codecontrol.com.ar', 'ficticio@patagonia-demo.com.ar'],
      cc: ['otro@ejemplo.com'],
      bcc: ['x@fuera.com'],
      subject: 'x',
      text: 'y',
    });
    expect(ok).toBe(true);
    const [message] = sendMailSpy.mock.calls[0];
    expect(message.to).toBe('ok@codecontrol.com.ar');
    expect(message.cc).toBe('otro@ejemplo.com');
    expect(message.bcc).toBeUndefined();
  });

  it('si ningún destinatario queda permitido no envía nada', async () => {
    vi.stubEnv('MAIL_ALLOWED_DOMAINS', 'codecontrol.com.ar');
    expect(await sendMail({ to: 'ficticio@patagonia-demo.com.ar', subject: 'x', text: 'y' })).toBe(false);
    expect(sendMailSpy).not.toHaveBeenCalled();
  });
});
