# Acceso administrativo y recuperación de cuentas

Esta guía explica cómo usar INTERCOL para cambiar el correo o la contraseña de un asesor sin borrar su cuenta ni sus registros.

## Quién puede usar el panel

La cuenta principal autorizada es la de jeblaje. Entra a /admin con esa cuenta. Debe aparecer el menú Dashboard, Asesores, Secciones, Roles y permisos y Guía y configuración. El acceso se valida con el UID administrador y los correos autorizados configurados en el proyecto.

Si el panel indica que no tienes permisos, confirma que iniciaste sesión con la cuenta jeblaje de Firebase Authentication. No crees otra cuenta ni cambies el UID para recuperar el acceso.

## Correo de recuperación antiguo

Algunas cuentas antiguas usan un correo interno terminado en @intercol-784d9.firebaseapp.com, generado desde el nombre de usuario. Firebase puede mostrarlo al intentar restablecer la contraseña, pero el asesor no puede recibir mensajes ahí. No pulses Enviar para esa dirección.

## Cambiar correo y contraseña desde el panel local

El panel web de GitHub Pages no puede modificar credenciales por sí solo. Para evitar el plan Blaze sin exponer credenciales, se usa un servicio local protegido que se comunica con el Admin SDK. El servicio solo escucha en esta computadora y solo acepta operaciones autenticadas de la cuenta administradora.

### Preparación única

1. En Firebase Console abre Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.
2. Guarda el JSON fuera de la carpeta del proyecto, por ejemplo C:\Users\Maye\secrets\intercol-adminsdk.json. No lo compartas, no lo agregues a Git y no lo subas a GitHub.
3. Abre PowerShell en la carpeta functions e instala las dependencias una sola vez:

```powershell
cd C:\Users\Maye\JEBLAJE\PROGRAMING\INTERCOL\functions
npm install
```

### Cada vez que vayas a cambiar credenciales

1. Levanta la página local en http://localhost:8000 y entra a /admin con jeblaje.
2. Abre otra ventana de PowerShell y ejecuta:

```powershell
cd C:\Users\Maye\JEBLAJE\PROGRAMING\INTERCOL\functions
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Maye\secrets\intercol-adminsdk.json"
npm run admin-local
```

3. En el panel abre Asesores y pulsa Cambiar acceso junto al asesor correcto.
4. Escribe el correo nuevo, la contraseña nueva o ambos, y pulsa Guardar cambios.
5. Cuando termines, vuelve a la ventana del servicio y presiona Ctrl+C.

El servicio actualiza la cuenta existente por su UID, mantiene sus datos de Firestore y sincroniza el correo del perfil y el alias de inicio de sesión. Si solo cambias la contraseña, deja vacío el campo de correo. Si cambias el correo, Firebase lo marca como pendiente de verificación.

## Cuando la página se publica en GitHub

El servicio local solo puede ser usado desde esta computadora con la página abierta en localhost:8000. Los demás usuarios no pueden acceder a él desde GitHub Pages. Para cambiar cuentas desde la web publicada y desde otros equipos se necesita un backend alojado; en este proyecto desplegar Cloud Functions requiere Blaze.

## Seguridad de la clave

El JSON de cuenta de servicio concede acceso administrativo al proyecto. Mantenlo fuera del repositorio y no lo pegues en el panel, el chat, GitHub ni capturas. Si se expone accidentalmente, revoca esa clave en Google Cloud IAM y genera otra.
