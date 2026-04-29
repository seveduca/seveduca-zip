/**
 * SeveducaZIP - Backend Google Apps Script (Fase 2)
 * 
 * INSTRUCCIONES:
 * 1. Ve a tu Google Drive, crea un nuevo "Google Apps Script".
 * 2. Borra el código por defecto y pega este archivo completo.
 * 3. Ejecuta la función "inicializarBaseDeDatos" para crear las hojas necesarias.
 * 4. Ve a "Implementar" > "Nueva implementación" > "Aplicación web".
 * 5. Configura acceso a "Cualquier persona" para que el frontend pueda comunicarse.
 */

const FOLDER_ROOT_NAME = "SeveducaZIP_Data";

// --- ENDPOINTS (API) ---

function doGet(e) {
  // Endpoint API para obtener datos desde el Frontend (GitHub Pages)
  if (e.parameter && e.parameter.action === 'get_data') {
    const dataJSON = JSON.stringify(getAllData());
    
    // Soporte para JSONP (crucial para saltarse el bloqueo CORS)
    if (e.parameter.callback) {
      return ContentService.createTextOutput(`${e.parameter.callback}(${dataJSON});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(dataJSON)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Servimos la interfaz HTML por defecto (Para el acceso alternativo en Apps Script)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SeveducaZIP - Calificación Inteligente')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let response = {};

    switch(action) {
      case 'guardar_resultado':
        response = guardarResultado(data.payload);
        break;
      case 'guardar_pdf':
        response = guardarPDFEnDrive(data.payload);
        break;
      case 'add_curso':
        response = addCurso(data.payload);
        break;
      case 'add_alumno':
        response = addAlumno(data.payload);
        break;
      case 'edit_alumno':
        response = editAlumno(data.payload);
        break;
      case 'import_alumnos':
        response = importAlumnos(data.payload);
        break;
      case 'delete_alumno':
        response = deleteAlumno(data.payload);
        break;
      case 'delete_evaluacion':
        response = deleteEvaluacion(data.payload);
        break;
      default:
        response = { success: false, error: "Acción no reconocida" };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- FUNCIONES DE BASE DE DATOS (SHEETS) ---

function inicializarBaseDeDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ['Cursos', 'Alumnos', 'Evaluaciones', 'Resultados'];
  
  hojas.forEach(nombre => {
    let sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      sheet = ss.insertSheet(nombre);
      // Configurar encabezados por defecto
      if(nombre === 'Resultados') {
        sheet.appendRow(["Timestamp", "ID_Evaluacion", "RUT_Alumno", "Nota", "Puntaje", "Respuestas_JSON", "PDF_Url"]);
      } else if (nombre === 'Cursos') {
        sheet.appendRow(["ID_Curso", "Nombre", "Fecha_Creacion"]);
      } else if (nombre === 'Alumnos') {
        sheet.appendRow(["ID_Alumno", "ID_Curso", "RUT", "Nombre_Completo", "Ultima_Nota"]);
      } else if (nombre === 'Evaluaciones') {
        sheet.appendRow(["ID_Evaluacion", "Nombre", "ID_Curso", "Fecha", "Preguntas", "Estado"]);
      }
      
      try {
        sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
      } catch(e) {} // Ignorar si hay menos de G columnas
    }
  });
}

function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const getSheetData = (sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    
    // Identificar si la primera fila es encabezado (ID_Curso, ALU-, etc)
    let startIndex = 0;
    if (data.length > 0) {
      const firstCell = String(data[0][0]);
      if (firstCell === 'ID_Curso' || firstCell === 'ID_Alumno' || firstCell === 'ID_Evaluacion' || firstCell === 'Timestamp') {
        startIndex = 1;
      }
    }
    
    if (data.length <= startIndex) return [];
    return data.slice(startIndex);
  };

  return {
    success: true,
    cursos: getSheetData('Cursos'),
    alumnos: getSheetData('Alumnos'),
    evaluaciones: getSheetData('Evaluaciones')
  };
}

function addCurso(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cursos');
  const idCurso = "CUR-" + new Date().getTime();
  sheet.appendRow([idCurso, payload.nombre, new Date()]);
  return { success: true, id: idCurso, nombre: payload.nombre };
}

function addAlumno(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Alumnos');
  const idAlumno = "ALU-" + new Date().getTime();
  // payload: { idCurso, rut, nombre }
  sheet.appendRow([idAlumno, payload.idCurso, payload.rut, payload.nombre, "N/A"]);
  return { success: true, id: idAlumno, rut: payload.rut, nombre: payload.nombre };
}

function editAlumno(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Alumnos');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][2]).trim() === String(payload.oldRut).trim() && String(data[i][1]) === String(payload.idCurso)) {
      sheet.getRange(i + 1, 3).setValue(payload.newRut);
      sheet.getRange(i + 1, 4).setValue(payload.newNombre);
      return { success: true };
    }
  }
  return { success: false, error: "Alumno no encontrado" };
}

function importAlumnos(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Alumnos');
  const newRows = payload.alumnos.map((al, index) => {
    const idAlumno = "ALU-" + new Date().getTime() + "-" + index;
    return [idAlumno, payload.idCurso, al.rut, al.nombre, "N/A"];
  });
  
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  }
  return { success: true, count: newRows.length };
}

function deleteAlumno(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Alumnos');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    const matchRut = payload.rut ? String(data[i][2]).trim() === String(payload.rut).trim() : false;
    const matchCurso = payload.idCurso ? String(data[i][1]) === String(payload.idCurso) : true;
    
    if (data[i][0] === payload.idAlumno || (matchRut && matchCurso)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "Alumno eliminado" };
    }
  }
  return { success: false, error: "Alumno no encontrado" };
}

function deleteEvaluacion(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Evaluaciones');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.idEvaluacion || data[i][1] === payload.nombre) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "Evaluación eliminada" };
    }
  }
  return { success: false, error: "Evaluación no encontrada" };
}

function guardarResultado(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Resultados');
  
  // Guardamos los datos de la hoja escaneada
  sheet.appendRow([
    new Date(),
    payload.evaluacionId || "EVAL-001",
    payload.rutAlumno || "Desconocido",
    payload.nota || 0.0,
    payload.puntaje || 0,
    JSON.stringify(payload.respuestas || {}),
    payload.pdfUrl || ""
  ]);
  
  return { success: true, message: "Resultado guardado correctamente en Sheets." };
}

// --- FUNCIONES DE ALMACENAMIENTO (DRIVE) ---

function getFolderRoot() {
  const folders = DriveApp.getFoldersByName(FOLDER_ROOT_NAME);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(FOLDER_ROOT_NAME);
  }
}

function getCursoFolder(cursoNombre) {
  const root = getFolderRoot();
  const folders = root.getFoldersByName(cursoNombre);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return root.createFolder(cursoNombre);
  }
}

function guardarPDFEnDrive(payload) {
  // payload.base64 (String base64 del PDF)
  // payload.fileName (ej. "Prueba_Matematicas_Juan_Perez.pdf")
  // payload.curso (ej. "1A")
  
  try {
    const cursoFolder = getCursoFolder(payload.curso || "Sin_Curso");
    const blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), MimeType.PDF, payload.fileName);
    const file = cursoFolder.createFile(blob);
    
    // Devolvemos la URL del archivo para guardarla en la planilla
    return { success: true, url: file.getUrl(), fileId: file.getId() };
  } catch(e) {
    return { success: false, error: "Error al guardar PDF: " + e.toString() };
  }
}
