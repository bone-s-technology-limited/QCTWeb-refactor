import { data } from 'dcmjs';
import DicomFileUploader from '../../../../cornerstone/src/utils/DicomFileUploader';
import { DicomMetadataStore } from '@ohif/core';
import jsPDF from 'jspdf';

const { DicomMetaDictionary, DicomDict } = data;

const EncapsulatedPdfSopClassUid = '1.2.840.10008.5.1.4.1.1.104.1';
const ExplicitVrLittleEndianTransferSyntaxUid = '1.2.840.10008.1.2.1';
const ImplementationUid = '1.3.6.1.4.1.30071.8';

// Enhanced database for PDF persistence
class PdfPersistenceDB {
  static DB_NAME = 'ohif_pdf_store';
  static STORE_NAME = 'pdf_documents';
  static DB_VERSION = 1;
  static db = null;

  // Initialize the database
  static async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = event => {
        console.error('IndexedDB error:', event);
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = event => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('studyUid', 'studyUid', { unique: false });
          store.createIndex('seriesUid', 'seriesUid', { unique: false });
          store.createIndex('instanceUid', 'instanceUid', { unique: true });
        }
      };
    });
  }

  // Sanitize data to ensure it's serializable (avoid DataCloneError)
  static sanitizeForStorage(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForStorage(item));
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function' || key.startsWith('_')) {
        continue;
      }
      sanitized[key] = this.sanitizeForStorage(value);
    }

    return sanitized;
  }

  // Store PDF data
  static async storePdf(pdfData) {
    const { studyUid, seriesUid, instanceUid, pdfBase64 } = pdfData;

    if (!studyUid || !seriesUid || !instanceUid || !pdfBase64) {
      throw new Error('Missing required PDF data fields');
    }

    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);

        const pdfRecord = {
          id: `${studyUid}_${seriesUid}_${instanceUid}`,
          studyUid,
          seriesUid,
          instanceUid,
          pdfBase64,
          metaData: this.sanitizeForStorage(pdfData.metaData || {}),
          timestamp: new Date().toISOString(),
        };

        const request = store.put(pdfRecord);

        request.onsuccess = () => resolve(true);
        request.onerror = event => {
          console.error('Error storing PDF in IndexedDB:', event);
          reject(new Error('Failed to store PDF in IndexedDB'));
        };
      });
    } catch (error) {
      console.error('Error in storePdf:', error);
      // Fall back to localStorage if IndexedDB fails
      try {
        const localKey = `local_ohif_pdf_${studyUid}_${seriesUid}_${instanceUid}`;
        localStorage.setItem(localKey, pdfBase64);
        return true;
      } catch (e) {
        console.error('Failed to store PDF in localStorage:', e);
        return false;
      }
    }
  }

  // Retrieve PDF data
  static async getPdf(studyUid, seriesUid, instanceUid) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const id = `${studyUid}_${seriesUid}_${instanceUid}`;

        const request = store.get(id);

        request.onsuccess = event => {
          const record = event.target.result;
          resolve(record || null);
        };

        request.onerror = event => {
          console.error('Error retrieving PDF from IndexedDB:', event);
          reject(new Error('Failed to retrieve PDF from IndexedDB'));
        };
      });
    } catch (error) {
      console.error('Error in getPdf:', error);
      // Fall back to localStorage if IndexedDB fails
      try {
        const localKey = `local_ohif_pdf_${studyUid}_${seriesUid}_${instanceUid}`;
        const pdfBase64 = localStorage.getItem(localKey);

        if (pdfBase64) {
          return {
            studyUid,
            seriesUid,
            instanceUid,
            pdfBase64,
            metaData: {},
            source: 'localStorage',
          };
        }
        return null;
      } catch (e) {
        console.error('Failed to retrieve PDF from localStorage:', e);
        return null;
      }
    }
  }

  // Get all PDFs for a study
  static async getPdfsForStudy(studyUid) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const index = store.index('studyUid');

        const request = index.getAll(studyUid);

        request.onsuccess = event => {
          resolve(event.target.result || []);
        };

        request.onerror = event => {
          console.error('Error retrieving PDFs for study from IndexedDB:', event);
          reject(new Error('Failed to retrieve PDFs for study from IndexedDB'));
        };
      });
    } catch (error) {
      console.error('Error in getPdfsForStudy:', error);
      return [];
    }
  }
}

function _getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return {
    date: `${year}${month}${day}`,
    time: `${hours}${minutes}${seconds}`,
  };
}

// Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Base64 string to ArrayBuffer conversion
function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate DICOM file from dataset
function getDICOMFromJSONDataset(dataset) {
  try {
    // Create a working copy to avoid modifying the original object
    const workingDataset = { ...dataset };

    // Ensure metadata fields are correct
    if (!workingDataset._meta) {
      throw new Error('Missing _meta in dataset');
    }

    const denaturalizedMetaHeader = DicomMetaDictionary.denaturalizeDataset(workingDataset._meta);
    const dicomDict = new DicomDict(denaturalizedMetaHeader);
    dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(workingDataset);

    // Generate DICOM buffer
    const dicomBuffer = dicomDict.write();

    // Create DICOM file and return Blob object
    const dicomBlob = new Blob([dicomBuffer], { type: 'application/dicom' });
    return dicomBlob;
  } catch (error) {
    console.error('getDICOMFromJSONDataset error:', error);
    throw error;
  }
}

// Create dataset with encapsulated PDF
function getJSONDatasetOfEncapsulatedPDF(pdfArrayBuffer, instance) {
  // Ensure pdfArrayBuffer is the correct type
  if (!(pdfArrayBuffer instanceof ArrayBuffer)) {
    throw new Error('PDF data must be ArrayBuffer type');
  }

  // Create date time
  const dateTime = _getCurrentDateTime();

  // Generate UIDs
  const seriesInstanceUid = DicomMetaDictionary.uid();
  const sopInstanceUid = DicomMetaDictionary.uid();

  // Ensure PDF data length is even (DICOM requirement)
  let pdfData = pdfArrayBuffer;
  const pdfSize = pdfArrayBuffer.byteLength;
  if (pdfSize % 2 !== 0) {
    const paddedBuffer = new ArrayBuffer(pdfSize + 1);
    const paddedView = new Uint8Array(paddedBuffer);
    paddedView.set(new Uint8Array(pdfArrayBuffer));
    paddedView[pdfSize] = 0x00; // Add padding byte
    pdfData = paddedBuffer;
  }

  // Convert PDF data to Base64 string for storage
  const pdfBase64 = arrayBufferToBase64(pdfData);

  // Build complete DICOM dataset
  const dataset = {
    _vrMap: {
      EncapsulatedDocument: 'OB',
    },
    _meta: {
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: EncapsulatedPdfSopClassUid,
      MediaStorageSOPInstanceUID: sopInstanceUid,
      TransferSyntaxUID: ExplicitVrLittleEndianTransferSyntaxUid,
      ImplementationClassUID: ImplementationUid,
    },

    // Patient information
    PatientID: instance.PatientID || '',
    PatientName: instance.PatientName || '',
    PatientBirthDate: instance.PatientBirthDate || '',
    PatientSex: instance.PatientSex || '',

    // Study information
    StudyInstanceUID: instance.StudyInstanceUID || DicomMetaDictionary.uid(),
    StudyDate: dateTime.date,
    StudyTime: dateTime.time,
    StudyID: instance.StudyID || '',
    AccessionNumber: instance.AccessionNumber || '',
    ReferringPhysicianName: instance.ReferringPhysicianName || '',
    StudyDescription: instance.StudyDescription || 'BMD Report',

    // Series information
    Modality: 'DOC',
    SeriesInstanceUID: seriesInstanceUid,
    SeriesNumber: instance.SeriesNumber ? parseInt(instance.SeriesNumber) + 1 : 1,
    SeriesDate: dateTime.date,
    SeriesTime: dateTime.time,
    SeriesDescription: 'BMD Report PDF',

    // Document properties
    ContentDate: dateTime.date,
    ContentTime: dateTime.time,
    DocumentTitle: 'BMD Report',
    ConceptNameCodeSequence: [
      {
        CodeValue: '18748-4',
        CodingSchemeDesignator: 'LN',
        CodeMeaning: 'Diagnostic imaging report',
      },
    ],
    MIMETypeOfEncapsulatedDocument: 'application/pdf',
    EncapsulatedDocument: pdfData,

    // Important flags
    isEncapsulatedDocument: true,
    BurnedInAnnotation: 'YES',

    // Instance information
    SOPClassUID: EncapsulatedPdfSopClassUid,
    SOPInstanceUID: sopInstanceUid,
    InstanceNumber: 1,
    SpecificCharacterSet: 'ISO_IR 192', // UTF-8

    // Manufacturer information
    Manufacturer: 'OHIF Viewer',
    ManufacturerModelName: 'BMD Reporting System',
  };

  // Create Blob and URL for direct PDF access
  const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  // Create storage keys for both session and local storage
  const sessionStorageKey = `session_ohif_pdf_${instance.StudyInstanceUID}_${seriesInstanceUid}_${sopInstanceUid}`;
  const localStorageKey = `local_ohif_pdf_${instance.StudyInstanceUID}_${seriesInstanceUid}_${sopInstanceUid}`;

  // Save PDF data to storage
  try {
    // Save to sessionStorage (for current session)
    sessionStorage.setItem(sessionStorageKey, pdfBase64);

    // Save to localStorage (persists after browser close)
    localStorage.setItem(localStorageKey, pdfBase64);

    // Also save to IndexedDB for long-term persistence
    PdfPersistenceDB.storePdf({
      studyUid: instance.StudyInstanceUID,
      seriesUid: seriesInstanceUid,
      instanceUid: sopInstanceUid,
      pdfBase64: pdfBase64,
      metaData: {
        patientName: instance.PatientName || '',
        studyDescription: instance.StudyDescription || 'BMD Report',
        seriesDescription: 'BMD Report PDF',
        contentDate: dateTime.date,
        contentTime: dateTime.time,
      },
    }).catch(err => {
      console.warn('Failed to save PDF to IndexedDB:', err);
    });

    // Save parameters to URL for page refresh scenarios
    const url = new URL(window.location.href);
    url.searchParams.set('pdfReportId', sopInstanceUid);
    url.searchParams.set('studyUid', instance.StudyInstanceUID);
    url.searchParams.set('seriesUid', seriesInstanceUid);

    // Update URL without refreshing the page
    window.history.replaceState({}, '', url);

    console.log('PDF parameters saved to URL, sessionStorage, localStorage, and IndexedDB');
  } catch (storageError) {
    console.warn('Failed to save PDF to storage:', storageError);
  }

  return {
    dataset,
    pdfUrl,
    pdfBase64,
    seriesInstanceUid,
    sopInstanceUid,
    storageKeys: {
      session: sessionStorageKey,
      local: localStorageKey,
    },
  };
}

// Enhanced upload function
async function uploadPDF(pdf, dataSource, instance) {
  try {
    console.log('Starting PDF upload process');

    // Check if pdf object is valid
    if (!pdf || typeof pdf.output !== 'function') {
      throw new Error('Invalid PDF object');
    }

    // Check if instance object is valid
    if (!instance || !instance.StudyInstanceUID) {
      throw new Error('Invalid DICOM instance object');
    }

    // Get PDF's ArrayBuffer
    const pdfArrayBuffer = pdf.output('arraybuffer');

    // Convert to DICOM dataset and get related information
    const { dataset, pdfUrl, pdfBase64, seriesInstanceUid, sopInstanceUid, storageKeys } =
      getJSONDatasetOfEncapsulatedPDF(pdfArrayBuffer, instance);

    // Convert to DICOM file
    const file = getDICOMFromJSONDataset(dataset);

    // Upload file
    console.log('Starting DICOM file upload');
    const fileUploader = new DicomFileUploader(file, dataSource);

    try {
      await fileUploader.load();
      console.log('Upload successfully completed');
    } catch (uploadError) {
      console.error('Upload failed:', uploadError);
    }

    try {
      // Get server configuration for URL building
      const serverConfig = dataSource.getConfig();
      const wadoRoot = serverConfig.wadoRoot || '';

      // Build DICOMweb paths
      const studyPath = instance.StudyInstanceUID;
      const seriesPath = seriesInstanceUid;
      const instancePath = sopInstanceUid;

      // Build URLs for different access methods
      const bulkDataURI = `${wadoRoot}/studies/${studyPath}/series/${seriesPath}/instances/${instancePath}/bulk/00420011`;

      // Create a simplified instance for OHIF viewer
      const viewFriendlyInstance = {
        // Basic DICOM attributes
        PatientID: instance.PatientID || '',
        PatientName: instance.PatientName || '',
        StudyInstanceUID: studyPath,
        StudyDescription: instance.StudyDescription || 'BMD Report',
        SeriesInstanceUID: seriesPath,
        SOPInstanceUID: instancePath,
        SOPClassUID: EncapsulatedPdfSopClassUid,
        Modality: 'DOC',
        SeriesDescription: 'BMD Report PDF',
        SeriesNumber: instance.SeriesNumber ? parseInt(instance.SeriesNumber) + 1 : 1,
        InstanceNumber: '1',

        // Direct PDF access for OHIF
        pdfUrl: pdfUrl,

        // For OHIF's native PDF support
        isEncapsulatedDocument: true,
        MIMETypeOfEncapsulatedDocument: 'application/pdf',

        // CRITICAL: This is the format OHIF's getDirectURL expects
        // It needs to be a string value, not an ArrayBuffer or nested object
        EncapsulatedDocument: pdfBase64,
      };

      // Add to DicomMetadataStore
      DicomMetadataStore.addInstances([viewFriendlyInstance], true);

      console.log('PDF successfully processed and added to DicomMetadataStore');

      // Show success message
      window.alert('PDF report upload successful!');

      // Return success object
      return {
        success: true,
        instance: viewFriendlyInstance,
        pdfUrl: pdfUrl,
        seriesInstanceUid: seriesInstanceUid,
        sopInstanceUid: sopInstanceUid,
        studyInstanceUid: instance.StudyInstanceUID,
      };
    } catch (processError) {
      console.error('Error registering PDF with DicomMetadataStore:', processError);

      // Show partial success message
      window.alert('PDF report created but may have display issues in the viewer.');

      return {
        success: true,
        warning: true,
        message: 'Report processed but may have display issues',
        error: processError.message,
        pdfUrl: pdfUrl,
      };
    }
  } catch (error) {
    console.error('Error in uploadPDF:', error);

    // Show error message
    window.alert(`Failed to upload PDF: ${error.message}`);

    return {
      success: false,
      error: error.message || 'Error processing PDF',
    };
  }
}

// Try to recover PDF function - can be called on page load
export async function tryRecoverPDF(dataSource) {
  try {
    // Get parameters from URL
    const url = new URL(window.location.href);
    const pdfReportId = url.searchParams.get('pdfReportId');
    const studyUid = url.searchParams.get('studyUid');
    const seriesUid = url.searchParams.get('seriesUid');

    // If no parameters in URL, cannot recover
    if (!pdfReportId || !studyUid || !seriesUid) {
      console.log('No PDF report parameters in URL, cannot recover');
      return null;
    }

    // Create storage keys for both session and local storage
    const sessionKey = `session_ohif_pdf_${studyUid}_${seriesUid}_${pdfReportId}`;
    const localKey = `local_ohif_pdf_${studyUid}_${seriesUid}_${pdfReportId}`;

    // Check for PDF data in sessionStorage first (current session)
    let pdfBase64 = sessionStorage.getItem(sessionKey);
    let storageSource = 'sessionStorage';

    // If not in sessionStorage, try localStorage (persists between sessions)
    if (!pdfBase64) {
      pdfBase64 = localStorage.getItem(localKey);
      storageSource = 'localStorage';
    }

    // If not in localStorage, try IndexedDB
    if (!pdfBase64) {
      try {
        const pdfRecord = await PdfPersistenceDB.getPdf(studyUid, seriesUid, pdfReportId);
        if (pdfRecord && pdfRecord.pdfBase64) {
          pdfBase64 = pdfRecord.pdfBase64;
          storageSource = 'IndexedDB';
        }
      } catch (e) {
        console.warn('Failed to get PDF from IndexedDB:', e);
      }
    }

    if (!pdfBase64) {
      console.log('PDF data not found in storage');
      // Try to fetch from server
      return tryFetchFromServer(dataSource, studyUid, seriesUid, pdfReportId);
    }

    // From Base64 create PDF Blob
    try {
      const pdfData = base64ToArrayBuffer(pdfBase64);
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);

      console.log(`Successfully recovered PDF from ${storageSource}`);

      // Create a simplified instance for OHIF viewer
      const viewFriendlyInstance = {
        PatientID: '',
        PatientName: '',
        StudyInstanceUID: studyUid,
        StudyDescription: 'BMD Report',
        SeriesInstanceUID: seriesUid,
        SOPInstanceUID: pdfReportId,
        SOPClassUID: EncapsulatedPdfSopClassUid,
        Modality: 'DOC',
        SeriesDescription: 'BMD Report PDF',
        SeriesNumber: 9999,
        InstanceNumber: '1',

        // For OHIF viewer compatibility
        isEncapsulatedDocument: true,
        MIMETypeOfEncapsulatedDocument: 'application/pdf',

        // Direct PDF access
        pdfUrl: pdfUrl,

        // CRITICAL: This is the format OHIF's getDirectURL expects
        EncapsulatedDocument: pdfBase64,
      };

      // Add to DicomMetadataStore
      DicomMetadataStore.addInstances([viewFriendlyInstance], true);

      // Return recovered PDF information
      return {
        success: true,
        pdfUrl,
        studyUid,
        seriesUid,
        instanceUid: pdfReportId,
        storageSource,
      };
    } catch (e) {
      console.error(`Failed to recover PDF from ${storageSource}:`, e);
      return tryFetchFromServer(dataSource, studyUid, seriesUid, pdfReportId);
    }
  } catch (error) {
    console.error('Error trying to recover PDF:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Enhanced server fetching
async function tryFetchFromServer(dataSource, studyUid, seriesUid, instanceUid) {
  try {
    // Get server configuration
    const serverConfig = dataSource.getConfig();
    const wadoRoot = serverConfig.wadoRoot || '';

    // Storage keys for persistence
    const sessionKey = `session_ohif_pdf_${studyUid}_${seriesUid}_${instanceUid}`;
    const localKey = `local_ohif_pdf_${studyUid}_${seriesUid}_${instanceUid}`;

    // Build multiple possible URLs to try
    const urls = [
      // Orthanc-specific PDF path
      `${wadoRoot}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/pdf`,
      // Standard DICOMweb paths
      `${wadoRoot}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/bulk/00420011`,
      // Other possible paths
      `${wadoRoot}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/rendered`,
      `${wadoRoot}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`,
    ];

    console.log('Attempting to fetch PDF from server using various paths');

    // Try each URL in sequence
    for (const url of urls) {
      try {
        console.log(`Trying to fetch PDF from: ${url}`);

        const response = await fetch(url, {
          headers: {
            Accept: 'application/pdf, application/octet-stream, */*',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          console.warn(`URL ${url} request failed: ${response.status}`);
          continue; // Try next URL
        }

        const buffer = await response.arrayBuffer();

        // Check if it's actually a PDF (should start with %PDF)
        const firstBytes = new Uint8Array(buffer.slice(0, 4));
        const header = String.fromCharCode.apply(null, firstBytes);
        if (header !== '%PDF') {
          console.warn(`URL ${url} did not return PDF data`);
          continue; // Try next URL
        }

        // Create PDF Blob and URL
        const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(pdfBlob);

        // Save to both storage types for future use
        const pdfBase64 = arrayBufferToBase64(buffer);

        try {
          sessionStorage.setItem(sessionKey, pdfBase64);
          localStorage.setItem(localKey, pdfBase64);

          // Also save to IndexedDB for long-term persistence
          await PdfPersistenceDB.storePdf({
            studyUid,
            seriesUid,
            instanceUid,
            pdfBase64,
            metaData: {
              source: 'server',
              url: url,
            },
          });
        } catch (storageError) {
          console.warn('Failed to save PDF to storage:', storageError);
        }

        console.log(`Successfully retrieved PDF from server at ${url}`);

        // Create a compatible instance for OHIF viewer
        const viewFriendlyInstance = {
          PatientID: '',
          PatientName: '',
          StudyInstanceUID: studyUid,
          StudyDescription: 'BMD Report',
          SeriesInstanceUID: seriesUid,
          SOPInstanceUID: instanceUid,
          SOPClassUID: EncapsulatedPdfSopClassUid,
          Modality: 'DOC',
          SeriesDescription: 'BMD Report PDF',
          SeriesNumber: 9999,
          InstanceNumber: '1',

          // For OHIF viewer compatibility
          isEncapsulatedDocument: true,
          MIMETypeOfEncapsulatedDocument: 'application/pdf',

          // Direct PDF access
          pdfUrl: pdfUrl,

          // CRITICAL: This is the format OHIF's getDirectURL expects
          EncapsulatedDocument: pdfBase64,
        };

        // Add to DicomMetadataStore
        DicomMetadataStore.addInstances([viewFriendlyInstance], true);

        return {
          success: true,
          pdfUrl,
          studyUid,
          seriesUid,
          instanceUid,
          source: 'server',
          url: url,
        };
      } catch (e) {
        console.warn(`Failed to fetch PDF from ${url}:`, e);
        // Continue with next URL
      }
    }

    // All attempts failed
    return {
      success: false,
      error: 'Unable to retrieve PDF from server - all paths failed',
    };
  } catch (error) {
    console.error('Error fetching PDF from server:', error);
    return {
      success: false,
      error: error.message || 'Unknown server error',
    };
  }
}

export default uploadPDF;
