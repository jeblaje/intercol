/*
 * REGISTRO DE SECCIONES
 *
 * El dashboard NO se modifica cuando agregues una nueva sección.
 * Solo crea su carpeta dentro de /secciones y agrega un objeto aquí.
 * Todo el HTML/CSS/JS de la sección vive dentro de su propia carpeta.
 */
window.INTERCOL_SECTIONS = [
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
    id: "reporte-servicio",
    name: "Reporte servicio",
    description: "Prepara reportes de caja ponchada y autorización de splitter.",
    icon: "▤",
    path: "secciones/reporte-servicio/index.html"
  }
];
