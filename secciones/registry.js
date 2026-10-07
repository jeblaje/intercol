/*
 * REGISTRO DE SECCIONES
 *
 * El dashboard NO se modifica cuando agregues una nueva sección.
 * Solo crea su carpeta dentro de /secciones y agrega un objeto aquí.
 * Todo el HTML/CSS/JS de la sección vive dentro de su propia carpeta.
 */
window.INTERCOL_SECTIONS = [
  {
    id: "mensajes-temporales",
    name: "Mensajes temporales",
    description: "Crea y administra mensajes que aparecen en el dashboard hasta su vencimiento.",
    icon: "◷",
    path: "secciones/mensajes-temporales/index.html"
  },
  {
    id: "notificaciones-pago",
    name: "Generación de facturas",
    description: "Programa cuándo verificar que se generó la factura de cada usuario.",
    icon: "◷",
    path: "secciones/notificaciones-pago/index.html",
    requiresAuth: true
  },
  {
    id: "acceso",
    name: "Iniciar sesión / Registrarse",
    description: "Accede con tu cuenta de asesor o crea una cuenta.",
    icon: "♙",
    path: "secciones/acceso/index.html",
    hideFromLists: true
  },
  {
    id: "utilidades",
    name: "Utilidades",
    description: "Espacios para herramientas internas.",
    icon: "▦",
    path: "secciones/utilidades/index.html"
  },
  {
    id: "enviar-moroso",
    name: "Enviar moroso",
    description: "Organiza los datos del moroso en un texto para copiar y enviar.",
    icon: "↗",
    path: "secciones/enviar-moroso/index.html"
  },
  {
    id: "verificar-caja",
    name: "Verificar Caja",
    description: "Herramienta para verificar y cuadrar la caja.",
    icon: "✓",
    path: "secciones/verificar-caja/index.html"
  },
  {
    id: "cajas-verificadas",
    name: "Cajas verificadas",
    description: "Busca cajas y consulta sus fichas compartidas.",
    icon: "▤",
    path: "secciones/cajas-verificadas/index.html"
  },
  {
    id: "reporte-servicio",
    name: "Reporte servicio",
    description: "Prepara reportes de caja ponchada y autorización de splitter.",
    icon: "▤",
    path: "secciones/reporte-servicio/index.html"
  }
];







