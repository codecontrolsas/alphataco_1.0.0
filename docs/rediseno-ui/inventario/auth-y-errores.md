# Inventario — Auth y errores

Ficha "ANTES" del rediseño (Fase 0). Cada `- [ ]` se tilda cuando la pantalla rediseñada conserva ese
elemento/comportamiento. Relevado del código en `feat/rediseno-ui` el 2026-10-07. "Rareza" = algo raro o
roto que ya existe hoy: se anota, NO se arregla en silencio (ver PLAN §9).

---

## Raíz — `/`

- [ ] Componente raíz: `src/app/page.tsx` — sin UI, `redirect('/dashboard')`.
- [ ] (`src/proxy.ts` redirige a `/login` si no hay sesión.)
- Rareza: comentario muerto con metadata del template "Free Next.js Template for Startup and SaaS" y `// return <Landing />`.

---

## Login — `/login` (`?error=oauth`)

- [ ] Componente raíz: `src/app/login/page.tsx` → `src/features/Auth/components/LoginForm.tsx`.
- [ ] Layout actual: bloque shadcn `login-03` — tarjeta centrada `max-w-sm` sobre `bg-muted`; arriba link a `/` con `BRAND_NAME` ("alphataco", `text-brand`, minúsculas). SIN banner lateral.
- [ ] Título "¡Es un placer verte de nuevo!" + descripción "Ingresá con tu correo y contraseña".
- [ ] Pie fuera de la card: "¿No tenés cuenta? El alta la hace un administrador de tu empresa." (no hay sign up, ni Apple, ni términos).

### Formulario de ingreso (form nativo + server action; NO react-hook-form)
- [ ] Campo **Email*** (`id/name=email`, `type=email`, placeholder `ejemplo@correo.com`, `autoComplete=email`, `data-testid="login-email-input"`).
- [ ] Campo **Contraseña*** (`id/name=password`, `type=password`, placeholder `Tu contraseña`, `autoComplete=current-password`, `data-testid="login-password-input"`).
- [ ] Link "¿Olvidaste tu contraseña?" a la derecha del label → `/reset_password`.
- [ ] Botón **Iniciar Sesion** (`LoginButton.tsx`, `formAction`, `w-full`, `data-testid="login-submit-button"`; texto "Cargando..." y deshabilitado mientras `pending`).
- [ ] Validación cliente con `loginSchema` (Zod, `src/shared/schemas/schemas.ts`) escrita por `getElementById` en `<p id="email_error">` / `<p id="password_error">` en **rojo inline** (`style.color='red'`). **No cambiar esos ids** (lo advierte el comentario del componente).
  - Email: "Email inválido".
  - Contraseña (`passwordSchema`): mín. 8 "La contraseña debe tener al menos 8 caracteres.", máx. 50, al menos una mayúscula, una minúscula, un número y un carácter especial (un mensaje por regla).
- [ ] Envío: `toast.promise` — loading "Iniciando Sesion...", éxito "¡Bienvenido!" + `router.push('/dashboard')`; error: si contiene `banned` → "Tu acceso ha sido revocado. Contacta al administrador de tu empresa."; si no el mensaje del server ("Correo o contraseña inválidos", mensaje FORBIDDEN de Better Auth, o "No se pudo iniciar sesión").
- [ ] Botón **Iniciar sesión con Google** (`GoogleButton.tsx`, outline, icono Google) + separador "O continuá con" — **solo si `isGoogleLoginEnabled`**; sin credenciales desaparecen botón y separador. Error → `toast.error`. Redirige al proveedor; callback `/dashboard`, error → `/login?error=oauth`.
- [ ] Aviso `?error=oauth`: caja destructive "No pudimos iniciar sesión con Google. Si es la primera vez que entrás, pedile a un administrador de tu empresa que te dé de alta: el sistema no crea cuentas solo."

### Estados especiales
- [ ] Carga: `src/app/login/loading.tsx` (skeleton).
- Rareza: el skeleton de `/login` imita el **layout partido viejo** (banner izquierdo + email/password con descripción + separador + link), no la card centrada actual.
- Rareza: "Iniciar Sesion" / "Iniciando Sesion..." sin tilde (copy actual; cambiarlo afecta Cypress solo si busca por texto).

---

## Recuperar contraseña — `/reset_password`

- [ ] Componente raíz: `src/app/reset_password/page.tsx` → `RecoveryPasswordForm.tsx`.
- [ ] Layout **partido** (2 columnas en `lg`): izquierda `RenderBanner` (server; lee cookie `theme` → `AutenticationDark` / `AutenticationLight`, + `RefreshComponent` que hace `router.refresh()` al montar); derecha formulario. En mobile el banner se oculta y aparece el link `BRAND_NAME` arriba.
- [ ] Banner: `BRAND_NAME` + cita **"Combinamos control de procesos, desarrollo de software y consultoría organizacional para ofrecerte soluciones integrales que generan resultados reales."** con footer `BRAND_NAME`. Fondo: grilla + glow naranja `rgba(255,167,38,…)` (claro) / degradé slate (oscuro). **Copy heredado de GH** (el PLAN pide sacarlo).
- [ ] Título: "¿Olvidaste tu contraseña? No te preocupes, te ayudaremos a restablecerla."

### Formulario (react-hook-form + `recoveryPassSchema`)
- [ ] Campo **Email*** (placeholder `email@hotmail.com`, descripción "Ingresa tu email para recibir un enlace seguro y recuperar tu contraseña."). Validación: "Email inválido".
- [ ] Botón **Enviar enlace de recuperación** (`w-full`; "Enviando..." con spinner y deshabilitado).
- [ ] Link "¿Recordaste tu contraseña? Iniciar sesión" → `/login` (`<a>` nativo).
- [ ] Envío: `resetPasswordAction(email)` (Better Auth `requestPasswordReset`, `redirectTo: '/reset_password/update-user'`). `toast.promise`: loading "Enviando enlace de recuperación..."; éxito "Si existe una cuenta con ese email, recibirás un correo con instrucciones seguras para restablecer tu contraseña."; error → mensaje del server o "Error al enviar el email de recuperación".
- [ ] Respuesta **uniforme** a propósito (no revela si el mail existe).
- [ ] Estado post-envío: reemplaza el form por caja verde "✓ Solicitud enviada exitosamente" + "Hemos enviado un enlace seguro a **{email}**…" + "¿No recibiste el email? **Reenviar**" (vuelve a mostrar el form con el email cargado).
- [ ] Carga: `src/app/reset_password/loading.tsx` (skeleton partido).

---

## Confirmar enlace — `/reset_password/confirm` (`?error=invalid_token`)

- [ ] Componente raíz: `src/app/reset_password/confirm/page.tsx` (mismo layout partido + `RenderBanner`).
- [ ] Sin error: título "Procesando solicitud..." + caja azul "Verificando enlace..." / "Por favor espera mientras procesamos tu solicitud."
- [ ] Con `error=invalid_token`: título "Enlace inválido o expirado" + caja roja + botón-link **Solicitar nuevo enlace** → `/reset_password`. Con otro valor de `error`: título de error pero caja azul.
- [ ] Carga: `confirm/loading.tsx`.
- Rareza: **página huérfana** — ningún archivo de `src/` enlaza a `/reset_password/confirm` (el mail apunta directo a `update-user`, ver comentario en `auth-actions.ts`).
- Rareza: lee `searchParams.error` de forma **síncrona**; en Next 16 `searchParams` es una Promise, así que `error` siempre es `''` y la pantalla siempre muestra "Procesando solicitud...".

---

## Nueva contraseña — `/reset_password/update-user` (`?token=…`, `?error=…`)

- [ ] Componente raíz: `src/app/reset_password/update-user/page.tsx` → `UpdateUserPasswordForm.tsx`. Layout partido + `RenderBanner`.
- [ ] Usado por **recuperación y por invitación** de usuarios (mismo tipo de token).
- [ ] Título "Establece tu nueva contraseña" + descripción larga ("Tu cuenta está a un paso de ser recuperada… al menos 6 caracteres… mayúsculas, minúsculas, números o símbolos.").
- Rareza: la descripción dice **6 caracteres** y "mayúsculas, minúsculas, números **o** símbolos"; el schema exige **8** y **todas** las reglas.
- [ ] Sin `token` o con `error` en la URL: en lugar del form, caja roja "Enlace inválido o expirado" + "Pedí un enlace nuevo desde “¿Olvidaste tu contraseña?”." + botón-link **Solicitar nuevo enlace** → `/reset_password`.

### Formulario (react-hook-form + `changePassSchema`)
- [ ] Campo **Contraseña*** (`autoComplete=new-password`, placeholder "contraseña segura", descripción "Ingresa tu nueva contraseña.") + Toggle ojo mostrar/ocultar (`aria-label` dinámico).
- [ ] Campo **Confirmar contraseña*** (idem, descripción "Ingresa tu nueva contraseña otra vez.") + Toggle ojo. Los dos toggles comparten el mismo estado `showPassword`.
- [ ] Validaciones: `passwordSchema` en ambos (8–50, mayúscula, minúscula, número, especial) + "Las contraseñas no coinciden." en confirmar.
- [ ] Botón **Cambiar contraseña** ("Cambiando contraseña..." y deshabilitado).
- [ ] Envío: `updatePasswordAction(password, token)`. `toast.promise`: loading "Actualizando contraseña..."; éxito "Tu contraseña ha sido cambiada con éxito. Ya puedes iniciar sesión con tu nueva contraseña." + `router.push('/login')`; error "El enlace de recuperación es inválido o expiró" / mensaje de Better Auth / "Error al actualizar la contraseña".
- [ ] Carga: `update-user/loading.tsx`.

---

## 404 — `not-found.tsx` (global)

- [ ] Componente: `src/app/not-found.tsx`.
- [ ] "404" grande con degradé azul→violeta, "¡Ups! Página no encontrada", "Lo sentimos, parece que la página que estás buscando no existe o ha sido movida."
- [ ] Botón-link **Volver al Dashboard** → `/dashboard`.
- Visual actual: fondo blanco con blobs azul/violeta difuminados, card glass (`bg-white/70 backdrop-blur`), `hover:scale-105`. Sin modo oscuro (colores fijos).

---

## Error de aplicación — `src/app/error.tsx`

- [ ] Client component. Al montar: `logger.error('Application Error')` + `posthog.captureException(error)`.
- [ ] Card: icono `AlertTriangle` + "Algo salió mal" + "Lo sentimos, ha ocurrido un error inesperado. Nuestro equipo ha sido notificado y estamos trabajando para solucionarlo."
- [ ] Bloque "Detalles del error:" con `error.message` + "ID de error: `{digest}`" (solo si hay digest).
- [ ] Bloque "Información técnica completa:" (`<pre>` scrolleable: mensaje, digest, stack, timestamp, user agent, URL).
- [ ] Botón **Copiar error** → portapapeles + toast "Error copiado al portapapeles".
- [ ] Botón **Reportar al equipo** → `sendErrorReport({…, source: 'Aplicacion'})`; "Enviando reporte..." con spinner; toasts "Reporte enviado al equipo de desarrollo" / "No se pudo enviar el reporte" (+descripción) / "Error al enviar el reporte".
- [ ] Botón **Intentar nuevamente** → `reset()`.
- [ ] Botón **Volver al inicio** → `window.location.href='/dashboard'` (recarga completa).

---

## Error global — `src/app/global-error.tsx`

- [ ] Reemplaza el root layout (`<html><body>`). `posthog.captureException(error, {$exception_type:'Global Error', digest})`.
- [ ] UI: `<NextError statusCode={0} />` (pantalla genérica de Next, sin estilos propios, sin botones).
- Rareza: no usa `reset` ni muestra nada propio.

---

## Error del dashboard — `src/app/dashboard/error.tsx`

- [ ] Client component. Al montar: `logger.error('Dashboard Error')`. **No** llama a PostHog (a diferencia de `app/error.tsx`).
- [ ] Card naranja: "Error en el Dashboard" + "Ha ocurrido un error inesperado en esta sección del dashboard".
- [ ] Bloque "Mensaje de error:" + "ID de referencia: `{digest}`" (si hay).
- [ ] "Información técnica completa:" (`<pre>` con encabezado `=== ERROR EN DASHBOARD ===`, mensaje, digest, timestamp, URL, UA, stack).
- [ ] **Copiar error** → toast "Error copiado al portapapeles" (descripción "Puedes pegarlo en un email o mensaje"); si falla "No se pudo copiar el error".
- [ ] **Reportar al equipo** → `sendErrorReport({…, source: 'Dashboard'})`, mismos toasts que el global.
- [ ] Caja azul "¿Qué puedes hacer?" con 3 viñetas (recargar con Intentar nuevamente / reportar / volver al inicio).
- [ ] **Intentar nuevamente** (`reset()`, naranja, `lg`) y **Volver al inicio** (icono Home, `window.location.href='/dashboard'`).

---

## Carga del dashboard — `src/app/dashboard/loading.tsx`

- [ ] Skeleton genérico para TODO `/dashboard/**` sin loading propio: 3 pestañas + `KpiCardsSkeleton` + 4 `SectionSkeleton` en grilla `xl:grid-cols-2` (forma del Dashboard principal).

<!-- estado: completo -->
