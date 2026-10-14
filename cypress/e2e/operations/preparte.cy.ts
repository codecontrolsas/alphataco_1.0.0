/**
 * Test: Operaciones - Preparte (Gestor de Pedidos)
 * Tab: Preparte
 *
 * IDs de testing usados:
 * - Cliente: 22222222-2222-2222-2222-222222222222 (Cliente Testing E2E)
 * - Contrato: 33333333-3333-3333-3333-333333333333 (Servicio Testing E2E)
 * - Sector: cccccccc-cccc-cccc-cccc-cccccccccccc (Sector Testing A)
 * - Área: dddddddd-dddd-dddd-dddd-dddddddddddd (Área Testing Norte)
 * - Equipo: ffffffff-ffff-ffff-ffff-ffffffffffff (Equipo Testing 1)
 * - Item: 44444444-4444-4444-4444-444444444444 (Item Testing E2E)
 *
 * data-testid agregados:
 * - nuevo-pedido-button: Botón "Nuevo Pedido"
 * - status-card-todos: Card "Todos"
 * - status-card-pendiente: Card "Pendientes"
 * - status-card-reprogramado: Card "Reprogramados"
 * - status-card-confirmado: Card "Confirmados"
 * - status-card-cancelado: Card "Cancelados"
 * - status-card-rechazado: Card "Rechazados"
 * - status-card-vencido: Card "Vencidos"
 * - cliente-select: Botón selector de cliente (MultiSelectCombobox)
 * - cliente-select-option-{id}: Opciones del selector de cliente
 * - contrato-select: Botón selector de contrato (MultiSelectCombobox)
 * - contrato-select-option-{id}: Opciones del selector de contrato
 * - jornada-select: Selector de jornada
 * - tipo-servicio-mensual: Radio button tipo mensual
 * - tipo-servicio-adicional: Radio button tipo adicional
 * - tipo-servicio-adicional-permanente: Radio button tipo adicional permanente
 * - solicitante-input: Input del solicitante
 * - sector-select: Selector de sector del cliente
 * - area-select: Selector de área del cliente
 * - equipo-select: Selector de equipos del cliente
 * - item-select-0: Selector del primer item
 * - observaciones-textarea: Textarea de observaciones
 * - archivo-adjunto-input: Input de archivo adjunto
 * - guardar-preparte-button: Botón guardar
 */

describe('Operaciones - Preparte (Gestor de Pedidos)', () => {
  const CLIENTE_TEST_ID = '22222222-2222-2222-2222-222222222222';
  const CONTRATO_TEST_ID = '33333333-3333-3333-3333-333333333333';
  const SECTOR_TEST_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const AREA_TEST_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const EQUIPO_TEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const ITEM_TEST_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    const email = Cypress.env('TEST_EMAIL') || 'testing@e2e.com';
    const password = Cypress.env('TEST_PASSWORD') || 'Testing123!';
    cy.login(email, password);
    cy.visit('/dashboard/operations');

    // Click en la tab de Preparte (Gestor de pedidos)
    cy.get('[data-testid="main-tab-preparte"]', { timeout: 10000 }).should('be.visible').click();
  });

  describe('Navegación', () => {
    it('debería navegar a la tab de preparte y mostrar el título', () => {
      cy.url().should('include', '/dashboard/operations');

      // Verificar que estamos en la tab correcta mediante el título
      cy.contains('h1', 'Gestor de Pedidos', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Cards de Estado - Visualización', () => {
    it('debería mostrar todas las cards de estado con los títulos correctos', () => {
      // Verificar que todas las cards de estado se renderizan
      cy.get('[data-testid="status-card-todos"]', { timeout: 10000 }).should('be.visible').and('contain.text', 'Todos');

      cy.get('[data-testid="status-card-pendiente"]').should('be.visible').and('contain.text', 'Pendientes');

      cy.get('[data-testid="status-card-reprogramado"]').should('be.visible').and('contain.text', 'Reprogramados');

      cy.get('[data-testid="status-card-confirmado"]').should('be.visible').and('contain.text', 'Confirmados');

      cy.get('[data-testid="status-card-cancelado"]').should('be.visible').and('contain.text', 'Cancelados');

      cy.get('[data-testid="status-card-rechazado"]').should('be.visible').and('contain.text', 'Rechazados');

      cy.get('[data-testid="status-card-vencido"]').should('be.visible').and('contain.text', 'Vencidos');
    });
  });

  describe('CREAR - Flujo completo de creación de preparte', () => {
    it('debería crear un preparte completo con todos los campos', () => {
      // 1. Abrir modal
      cy.get('[data-testid="nuevo-pedido-button"]', { timeout: 10000 }).should('be.visible').click();

      cy.contains('Nuevo Pedido', { timeout: 10000 }).should('be.visible');
      cy.wait(1000);

      // 2. Seleccionar Cliente
      cy.get('[data-testid="cliente-select"]').should('be.visible').click();
      cy.wait(1000);

      cy.get(`[data-testid="cliente-select-option-${CLIENTE_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="cliente-select"]').click();
      cy.wait(500);

      // Verificar selección
      cy.get('[data-testid="cliente-select"]').should('contain.text', 'Cliente Testing E2E');

      // 3. Seleccionar Contrato
      cy.get('[data-testid="contrato-select"]', { timeout: 15000 }).should('be.visible').and('not.be.disabled');

      cy.wait(500);

      cy.get('[data-testid="contrato-select"]').click();
      cy.wait(1000);

      cy.get(`[data-testid="contrato-select-option-${CONTRATO_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="contrato-select"]').click();
      cy.wait(500);

      // Verificar selección
      cy.get('[data-testid="contrato-select"]').should('contain.text', 'Servicio Testing E2E');

      // 4. Mantener fechas por defecto (ya están seleccionadas)
      cy.contains('Fecha de Solicitud').should('exist');
      cy.contains('Fecha de Ejecución Solicitada').should('exist');

      // 5. Seleccionar Jornada
      cy.get('[data-testid="jornada-select"]').click();
      cy.get('[data-testid="jornada-option-8"]').click();

      // 6. Seleccionar Tipo de servicio
      cy.get('[data-testid="tipo-servicio-mensual"]').click();

      // 7. Ingresar Solicitante
      cy.get('[data-testid="solicitante-input"]').clear().type('Solicitante Testing E2E');

      // 8. Seleccionar Sector del cliente
      cy.get('[data-testid="sector-select"]', { timeout: 10000 }).should('be.visible').and('not.be.disabled').click();

      cy.wait(1000);

      cy.get(`[data-testid="sector-select-option-${SECTOR_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="sector-select"]').click();
      cy.wait(500);

      // 9. Seleccionar Área del cliente
      cy.get('[data-testid="area-select"]', { timeout: 10000 }).should('be.visible').and('not.be.disabled').click();

      cy.wait(1000);

      cy.get(`[data-testid="area-select-option-${AREA_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="area-select"]').click();
      cy.wait(500);

      // 10. Seleccionar Equipo del cliente
      cy.get('[data-testid="equipo-select"]', { timeout: 10000 }).should('be.visible').and('not.be.disabled').click();

      cy.wait(1000);

      cy.get(`[data-testid="equipo-select-option-${EQUIPO_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="equipo-select"]').click();
      cy.wait(500);

      // 11. Seleccionar Item
      cy.get('[data-testid="item-select-0"]', { timeout: 10000 }).should('be.visible').and('not.be.disabled').click();

      cy.wait(1000);

      cy.get(`[data-testid="item-select-0-option-${ITEM_TEST_ID}"]`, { timeout: 10000 })
        .scrollIntoView()
        .should('be.visible')
        .click();

      // Cerrar popover
      cy.get('[data-testid="item-select-0"]').click();
      cy.wait(500);

      // 12. Ingresar Observaciones
      cy.get('[data-testid="observaciones-textarea"]').clear().type('Observaciones de testing E2E para el preparte');

      // 13. Subir archivo adjunto
      cy.get('[data-testid="archivo-adjunto-input"]').selectFile('cypress/fixtures/test-assets/img-test.jpg', {
        force: true,
      });

      // 14. Guardar preparte
      cy.get('[data-testid="guardar-preparte-button"]').should('be.visible').and('not.be.disabled').click();

      // 15. Verificar que se guardó correctamente y capturar el número de pedido
      // Esperar el toast de éxito y extraer el número de pedido
      cy.contains(/Se crearon .* pedidos correctamente con el número de pedido/, { timeout: 10000 })
        .should('be.visible')
        .invoke('text')
        .then((toastText) => {
          // Extraer el número de pedido del mensaje
          // Formato: "Se crearon X pedidos correctamente con el número de pedido NUMERO"
          const match = toastText.match(/número de pedido\s+(\S+)/);
          const numeroPedido = match ? match[1] : null;

          cy.log(`Número de pedido creado: ${numeroPedido}`);

          // Guardar el número de pedido para usarlo después
          if (numeroPedido) {
            cy.wrap(numeroPedido).as('numeroPedido');
          }
        });

      // Verificar que estamos de vuelta en la vista principal
      cy.get('[data-testid="status-card-todos"]').should('be.visible');

      // 16. Verificar que el preparte aparece en la tabla con el número de pedido
      cy.get('@numeroPedido').then((numeroPedido) => {
        if (numeroPedido) {
          // Buscar el número de pedido en la tabla
          cy.contains(numeroPedido as any, { timeout: 10000 }).should('be.visible');

          cy.log(`✅ Preparte con número ${numeroPedido} encontrado en la tabla`);
        }
      });

      // 17. Confirmar el preparte (enviarlo al parte diario)
      cy.get('@numeroPedido').then((numeroPedido) => {
        if (numeroPedido) {
          // Esperar 5 segundos para evitar que el refresh cierre el modal
          cy.wait(5000);

          // Buscar y hacer click en el botón de confirmar
          // Usamos force: true porque el botón puede estar oculto por overflow en la tabla
          cy.get(`[data-testid="confirmar-button-${numeroPedido}"]`, { timeout: 10000 })
            .should('exist')
            .click({ force: true });

          // Esperar a que se abra el modal de confirmación
          cy.contains('Confirmado por').should('be.visible');

          // Ingresar el nombre de quien confirma
          cy.get('[data-testid="confirmado-por-input"]').should('be.visible').type('Usuario Testing E2E');

          // Hacer click en el botón confirmar del modal
          cy.get('[data-testid="confirmar-modal-button"]').should('be.visible').and('not.be.disabled').click();

          // Esperar a que se cierre el modal
          cy.contains('Confirmado por').should('not.exist');

          // Esperar a que se actualice la tabla
          cy.wait(3000);

          // 18. Verificar que el estado cambió a "Confirmado"
          // Usar el data-testid del badge de status para verificar
          cy.get(`[data-testid="status-badge-${numeroPedido}"]`, { timeout: 10000 })
            .should('exist')
            .and('contain.text', 'confirmado');

          cy.log(`✅ Preparte ${numeroPedido} confirmado exitosamente`);
        }
      });
    });
  });
});
