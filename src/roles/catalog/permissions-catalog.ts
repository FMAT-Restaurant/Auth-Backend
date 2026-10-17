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
inventory|Inventario y Almacén|Package|inventory:view~Ver inventario~Consultar existencias y stock de ingredientes;inventory:ingredients:create~Agregar insumos~Registrar nuevos insumos y productos en bodega;inventory:stock:update_status~Actualizar stock~Modificar cantidades, mermas y estados;inventory:ingredients:delete~Eliminar insumos~Dar de baja materias primas de la base de datos
kitchen|Cocina y Pantalla KDS|UtensilsCrossed|kitchen:kds:view~Ver pantalla KDS~Visualizar comandas en cocina y tiempos de preparación;kitchen:order:start_preparation~Iniciar preparación~Marcar platillos en cocción;kitchen:order:mark_ready~Marcar como listo~Notificar que la orden está lista para servir
orders|Pedidos y Ventas (POS)|Receipt|orders:view~Ver pedidos~Consultar órdenes en curso y detalle de comandas;orders:create~Crear pedidos~Abrir nuevas órdenes y capturar platillos;orders:cancel~Cancelar pedidos~Anular comandas o platillos con autorización
menu|Menú y Carta|BookOpen|menu:view~Ver menú~Consultar carta y catálogo de precios;menu:edit~Editar menú~Modificar precios, recetas y disponibilidad
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
