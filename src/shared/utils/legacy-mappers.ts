/**
 * Normaliza un texto para usarlo como segmento de una ruta de Supabase Storage.
 *
 * Storage rechaza con `InvalidKey` cualquier caracter fuera de ASCII (tildes, ñ), asi que
 * TODO segmento que provenga de datos cargados por el usuario (nombre de empresa, nombre del
 * empleado, dominio del equipo, nombre del tipo de documento) debe pasar por aca antes de
 * armar el path.
 */
export const formatPathSegment = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[áäàâ]/g, 'a')
    .replace(/[éëèê]/g, 'e')
    .replace(/[íïìî]/g, 'i')
    .replace(/[óöòô]/g, 'o')
    .replace(/[úüùû]/g, 'u')
    .replace(/ñ/g, 'n') // Reemplaza ñ por n
    .replace(/['"]/g, '') // Elimina apóstrofes y comillas
    .replace(/[^a-z0-9-]/g, '-') // Reemplaza cualquier carácter que no sea letra, número o guión por guión
    .replace(/-+/g, '-') // Reemplaza múltiples guiones consecutivos por uno solo
    .replace(/^-|-$/g, ''); // Elimina guiones al inicio y al final
};

export const formatDocumentTypeName = (documentType: string) => {
  return formatPathSegment(documentType);
};
// export const stylesPDF = StyleSheet.create({
//   page: {
//     flexDirection: 'column',
//     padding: 20,
//   },
//   section: {
//     marginBottom: 10,
//   },
//   label: {
//     fontSize: 12,
//     fontWeight: 'bold',
//   },
//   value: {
//     fontSize: 12,
//     marginTop: 4,
//   },
//   checkboxContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   checkbox: {
//     width: 12,
//     height: 12,
//     borderWidth: 1,
//     marginRight: 8,
//   },
//   radioButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   radioLabel: {
//     fontSize: 12,
//     marginRight: 4,
//   },
//   text: {
//     marginRight: 20,
//   },
//   text2: {
//   },
// });
