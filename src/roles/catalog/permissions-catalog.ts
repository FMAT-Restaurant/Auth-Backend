export interface PermissionDefinition {
  code: string;
  label: string;
  description: string;
}

export interface ServicePermissionsGroup {
  serviceKey: string;
  serviceName: string;
  iconName?: string;
  permissions: PermissionDefinition[];
}

const CATALOG_SPEC = `
inventory|Inventario y Almacén|Package|inventory:items:read~Ver insumos~Consultar catálogo y existencias de insumos;inventory:items:write~Gestionar insumos~Crear, editar y dar de baja insumos del catálogo;inventory:batches:read~Ver lotes~Consultar lotes y fechas de caducidad (FEFO);inventory:batches:write~Gestionar lotes~Registrar entradas, ajustes y mermas de lotes;inventory:suppliers:read~Ver proveedores~Consultar directorio de proveedores;inventory:suppliers:write~Gestionar proveedores~Crear, editar y desactivar proveedores;inventory:recipes:read~Ver recetas~Consultar recetas, costos y disponibilidad por stock;inventory:reservations:read~Ver reservas de stock~Consultar apartados de stock por órdenes activas;inventory:movements:read~Ver movimientos~Consultar bitácora e historial de movimientos de almacén
kitchen|Cocina y Pantalla KDS|UtensilsCrossed|kitchen:kds:view~Ver pantalla KDS~Visualizar comandas en cocina y tiempos de preparación;kitchen:order:start_preparation~Iniciar preparación~Marcar platillos en cocción;kitchen:order:mark_ready~Marcar como listo~Notificar que la orden está lista para servir
orders|Pedidos y Ventas (POS)|Receipt|orders:view~Ver pedidos~Consultar órdenes en curso y detalle de comandas;orders:create~Crear pedidos~Abrir nuevas órdenes y capturar platillos;orders:cancel~Cancelar pedidos~Anular comandas o platillos con autorización
menu|Menú y Carta|BookOpen|menu:entries:view~Ver platillos~Consultar carta, platillos y precios;menu:entries:manage~Gestionar platillos~Crear, editar y cambiar disponibilidad de platillos;menu:categories:view~Ver categorías~Consultar categorías del menú;menu:categories:manage~Gestionar categorías~Crear, editar y ordenar categorías del menú;menu:recipes:view~Ver recetas del menú~Consultar fichas técnicas y recetas vinculadas;menu:recipes:manage~Gestionar recetas del menú~Crear y editar recetas de platillos;menu:offers:view~Ver ofertas y promociones~Consultar ofertas vigentes;menu:offers:manage~Gestionar ofertas y promociones~Crear, editar y desactivar promociones
sala|Sala y Mesas|LayoutGrid|sala:tables:view~Ver mapa de mesas~Consultar estado ocupado/libre de mesas;sala:tables:assign_diner~Asignar comensales~Ubicar clientes en mesas disponibles;sala:tables:assign_waiter~Asignar mesero~Vincular mesero responsable a la mesa
billing|Facturación y Caja|CreditCard|billing:invoices:create~Emitir comprobantes~Generar tickets de pago y facturas;billing:reports:view~Ver reportes de caja~Consultar ingresos del turno y arqueo
staff|Personal y Seguridad|Users|staff:view~Ver colaboradores~Consultar lista de colaboradores y perfiles;staff:manage~Gestionar colaboradores y roles~Crear, editar, restablecer claves y crear roles
`.trim();

export const SYSTEM_PERMISSIONS_CATALOG: ServicePermissionsGroup[] = CATALOG_SPEC.split('\n').map(
  (line) => {
    const [serviceKey, serviceName, iconName, rawPerms] = line.trim().split('|');
    const permissions = rawPerms.split(';').map((item) => {
      const [code, label, description] = item.split('~');
      return { code, label, description };
    });
    return { serviceKey, serviceName, iconName, permissions };
  },
);
