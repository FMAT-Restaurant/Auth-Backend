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
kitchen|Cocina y Pantalla KDS|UtensilsCrossed|kitchen:queues:view~Ver cola KDS de preparación~Visualizar comandas en cocina ordenadas por tiempo de espera y filtrar por estación;kitchen:orders:start_preparation~Iniciar preparación de orden~Pasar comanda a preparación consumiendo insumos en inventario;kitchen:items:ready~Marcar platillo como listo~Marcar platillo como listo notificando en tiempo real al mesero;kitchen:orders:ready~Marcar orden completa lista~Marcar todos los platillos y comanda como listos para entrega hacia la mesa;kitchen:items:reject~Rechazar platillo por falta física~Rechazar platillo en preparación por falta de ingredientes en cocina;kitchen:items:cancel~Cancelar platillo desde cocina~Permitir al personal de cocina suprimir un platillo antes de comenzar su cocción;kitchen:orders:void_error~Anular orden por error de cocina~Anular comanda por desperfecto atribuible a cocina sin cargo al comensal
orders|Pedidos y Ventas (POS)|Receipt|orders:orders:view~Consultar órdenes y comandas~Consultar pedidos activos, historial de comandas y detalle completo;orders:orders:create~Crear nueva comanda~Abrir nuevo pedido para mesa o para llevar y capturar platillos iniciales;orders:orders:update~Modificar comanda en borrador~Agregar platillos, alterar cantidades, notas o modificadores;orders:orders:confirm~Confirmar comanda a cocina~Enviar comanda formalmente a cocina reservando insumos en inventario;orders:orders:cancel~Cancelar comanda por cliente~Cancelar orden a petición del cliente o por desistimiento en mesa;orders:orders:void_admin~Anulación administrativa (Merma)~Anulación especial para pedidos en preparación registrando merma justificada;orders:orders:transfer~Transferir mesa o comensal~Reasignar una comanda en curso a otra mesa física o comensal;orders:items:redo~Solicitar rehacer platillo~Notificar a cocina que un platillo entregado debe cocinarse de nuevo;orders:orders:request_bill~Solicitar cuenta / ticket~Notificar a Caja que la mesa solicita la cuenta bloqueando adiciones
menu|Menú y Carta|BookOpen|menu:catalog:read~Ver catálogo~Consultar el catálogo visible y buscar;menu:catalog:print~Imprimir carta~Generar la carta en PDF;menu:categories:read~Ver categorías~Consultar categorías (administración);menu:categories:write~Gestionar categorías~Crear, editar y eliminar categorías;menu:entries:read~Ver entradas~Consultar entradas en cualquier estado;menu:entries:write~Gestionar entradas~Crear, editar datos y eliminar entradas;menu:entries:status~Cambiar estado de entradas~Activar, inactivar, archivar y desarchivar;menu:offers:read~Ver ofertas~Consultar ofertas y composición (administración);menu:offers:write~Gestionar ofertas~Crear y editar ofertas y su composición (incluida la copia armada en el front) y eliminarlas;menu:offers:status~Cambiar estado de ofertas~Activar e inactivar ofertas y opciones;menu:recipes:read~Ver recetas~Consultar recetas y su historial;menu:recipes:write~Gestionar recetas~Crear, editar y eliminar recetas;menu:images:write~Gestionar imágenes~Cargar imágenes y reemplazar su archivo
sala|Sala y Mesas|LayoutGrid|sala:tables:view~Ver plano y mesas~Consultar catálogo de mesas, detalle individual y estado en vivo del plano;sala:tables:create~Crear mesas~Registrar nuevas mesas físicas definiendo número, capacidad y zona;sala:tables:update~Editar mesas~Modificar número, capacidad o zona de una mesa física existente;sala:tables:delete~Dar de baja mesas~Baja lógica de mesa física libre sin unión activa ni reservas futuras;sala:tables:occupy~Ocupar mesas~Sentar comensales en mesa libre e iniciar sesión de consumo;sala:tables:update_status~Cambiar estado físico de mesas~Registrar salida de comensales y confirmar fin de limpieza;sala:tables:assign_waiter~Asignar mesero a mesa~Asignar o reasignar el mesero responsable de atender una mesa activa;sala:assignments:view~Ver asignaciones de meseros~Consultar asignaciones activas e históricas de meseros a mesas;sala:table_unions:view~Ver uniones de mesas~Consultar uniones activas o disueltas entre mesas de la misma zona;sala:table_unions:create~Unir mesas~Agrupar dos o más mesas libres de la misma zona para grupos grandes;sala:table_unions:release~Liberar uniones de mesas~Disolver unión activa pasando mesas a limpieza pendiente;sala:reservations:view~Ver reservas y disponibilidad~Consultar agenda de reservas y buscar mesas disponibles;sala:reservations:create~Crear reservas~Registrar nueva reservación confirmada con fecha, horario y contacto;sala:reservations:update~Reprogramar reservas~Modificar mesa, fecha, horario o comensales de reserva confirmada;sala:reservations:cancel~Cancelar reservas~Cancelar reserva confirmada para liberar franja horaria;sala:reservations:mark_no_show~Registrar No-show~Marcar reserva confirmada como No-show tras expirar tolerancia;sala:waitlist_entries:view~Ver lista de espera~Consultar fila presencial de clientes en espera en orden FIFO;sala:waitlist_entries:create~Registrar en lista de espera~Agregar comensales sin reserva a la fila presencial;sala:waitlist_entries:update_status~Gestionar turnos en espera~Cambiar estado de espera (sentado, cancelado o en espera)
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

/** Códigos válidos de permiso, para validar lo que se asigna a un rol. */
export const SYSTEM_PERMISSION_CODES: ReadonlySet<string> = new Set(
  SYSTEM_PERMISSIONS_CATALOG.flatMap((group) => group.permissions.map((p) => p.code)),
);
