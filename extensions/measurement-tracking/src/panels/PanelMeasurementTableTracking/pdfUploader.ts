import { data } from 'dcmjs';
import DicomFileUploader from '../../../../cornerstone/src/utils/DicomFileUploader';
import { DicomMetadataStore } from '@ohif/core';
import jsPDF from 'jspdf';

const { DicomMetaDictionary, DicomDict } = data;

const EncapsulatedPdfSopClassUid = '1.2.840.10008.5.1.4.1.1.104.1';
const ExplicitVrLittleEndianTransferSyntaxUid = '1.2.840.10008.1.2.1';
const ImplementationUid = '1.3.6.1.4.1.30071.8';

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

  // Save PDF data to both sessionStorage and localStorage for persistence
  try {
    // Save to sessionStorage (for current session)
    sessionStorage.setItem(sessionStorageKey, pdfBase64);

    // Save to localStorage (persists after browser close)
    localStorage.setItem(localStorageKey, pdfBase64);

    // Save parameters to URL for page refresh scenarios
    const url = new URL(window.location.href);
    url.searchParams.set('pdfReportId', sopInstanceUid);
    url.searchParams.set('studyUid', instance.StudyInstanceUID);
    url.searchParams.set('seriesUid', seriesInstanceUid);

    // Update URL without refreshing the page
    window.history.replaceState({}, '', url);

    console.log('PDF parameters saved to URL, sessionStorage, and localStorage');
  } catch (storageError) {
    console.warn('Failed to save PDF to storage:', storageError);
    // Continue execution, this is just an enhancement
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
function uploadPDF(pdf, dataSource, instance) {
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

    return fileUploader
      .load()
      .then(() => {
        console.log('Upload successfully completed');

        try {
          // Get server configuration
          const serverConfig = dataSource.getConfig();
          const wadoRoot = serverConfig.wadoRoot || '';

          // Build DICOMweb paths
          const studyPath = instance.StudyInstanceUID;
          const seriesPath = seriesInstanceUid;
          const instancePath = sopInstanceUid;

          // Various URL formats that Orthanc might support
          const bulkDataURI = `${wadoRoot}/studies/${studyPath}/series/${seriesPath}/instances/${instancePath}/bulk/00420011`;
          const wadoURI = `${wadoRoot}/studies/${studyPath}/series/${seriesPath}/instances/${instancePath}`;
          const renderedURI = `${wadoRoot}/studies/${studyPath}/series/${seriesPath}/instances/${instancePath}/rendered`;
          const orthancPdfURI = `${wadoRoot}/studies/${studyPath}/series/${seriesPath}/instances/${instancePath}/pdf`;

          // Create a view-friendly instance object for UI display
          const viewFriendlyInstance = {
            // Basic instance information
            PatientID: instance.PatientID || '',
            PatientName: instance.PatientName || '',
            StudyInstanceUID: studyPath,
            StudyDescription: instance.StudyDescription || 'BMD Report',

            // New UIDs
            SeriesInstanceUID: seriesPath,
            SOPInstanceUID: instancePath,
            SOPClassUID: EncapsulatedPdfSopClassUid,

            // Series information
            Modality: 'DOC',
            SeriesDescription: 'BMD Report PDF',
            SeriesNumber: instance.SeriesNumber ? parseInt(instance.SeriesNumber) + 1 : 1,

            // Document properties
            MIMETypeOfEncapsulatedDocument: 'application/pdf',
            DocumentTitle: 'BMD Report',

            // Important flags
            isEncapsulatedDocument: true,

            // Using custom EncapsulatedDocument structure
            EncapsulatedDocument: {
              // Provide multiple URLs to increase retrieval success rate
              InlineBinary: pdfBase64,
              BulkDataURI: bulkDataURI,
              WadoURI: wadoURI,
              RenderedURI: renderedURI,
              OrthancPdfURI: orthancPdfURI,

              // Storage keys for session and local storage
              StorageKeys: storageKeys,

              // Enhanced retrieveBulkData method
              retrieveBulkData: async function (options) {
                console.log('Attempting to retrieve PDF data...');

                // First try to recover from sessionStorage
                if (
                  this.StorageKeys &&
                  this.StorageKeys.session &&
                  sessionStorage.getItem(this.StorageKeys.session)
                ) {
                  try {
                    console.log('Recovering PDF data from sessionStorage');
                    const base64Data = sessionStorage.getItem(this.StorageKeys.session);
                    const buffer = base64ToArrayBuffer(base64Data);
                    return buffer;
                  } catch (e) {
                    console.warn('Failed to recover from sessionStorage:', e);
                    // Continue with other methods
                  }
                }

                // Then try localStorage
                if (
                  this.StorageKeys &&
                  this.StorageKeys.local &&
                  localStorage.getItem(this.StorageKeys.local)
                ) {
                  try {
                    console.log('Recovering PDF data from localStorage');
                    const base64Data = localStorage.getItem(this.StorageKeys.local);
                    const buffer = base64ToArrayBuffer(base64Data);
                    return buffer;
                  } catch (e) {
                    console.warn('Failed to recover from localStorage:', e);
                    // Continue with other methods
                  }
                }

                // Then try from InlineBinary
                if (this.InlineBinary) {
                  try {
                    console.log('Recovering PDF data from InlineBinary');
                    const buffer = base64ToArrayBuffer(this.InlineBinary);
                    return buffer;
                  } catch (e) {
                    console.warn('Failed to recover from InlineBinary:', e);
                    // Continue with other methods
                  }
                }

                // Try all possible URL paths
                const urls = [
                  this.OrthancPdfURI, // Orthanc-specific PDF path
                  this.BulkDataURI, // Standard DICOMweb BulkData path
                  this.RenderedURI, // Rendered path
                  this.WadoURI, // Basic WADO path
                ].filter(Boolean); // Remove any undefined or null URLs

                // Try each URL in sequence
                for (const url of urls) {
                  try {
                    console.log(`Attempting to get PDF from URL: ${url}`);
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

                    console.log(`Successfully retrieved PDF data from ${url}`);

                    // Save to storage for future use
                    if (this.StorageKeys) {
                      try {
                        const base64Data = arrayBufferToBase64(buffer);
                        if (this.StorageKeys.session) {
                          sessionStorage.setItem(this.StorageKeys.session, base64Data);
                        }
                        if (this.StorageKeys.local) {
                          localStorage.setItem(this.StorageKeys.local, base64Data);
                        }
                        console.log('PDF data saved to storage for future use');
                      } catch (storageError) {
                        console.warn('Failed to save PDF to storage:', storageError);
                      }
                    }

                    return buffer;
                  } catch (e) {
                    console.warn(`Failed to get PDF from ${url}:`, e);
                    // Continue with next URL
                  }
                }

                // If all methods failed, throw an error
                throw new Error('Failed to retrieve PDF data - all methods failed');
              },
            },

            // Server information
            wadoRoot: wadoRoot,

            // Fallback URL
            pdfUrl: orthancPdfURI || renderedURI,

            // Extra information for debugging
            _pdfURIs: {
              bulkDataURI,
              wadoURI,
              renderedURI,
              orthancPdfURI,
            },
          };

          // Add to DicomMetadataStore
          DicomMetadataStore.addInstances([viewFriendlyInstance], true);

          // Return success object
          return {
            success: true,
            instance: viewFriendlyInstance,
          };
        } catch (storeError) {
          console.error('Error adding to DicomMetadataStore:', storeError);
          return {
            success: true,
            warning: 'Report uploaded successfully, but display may have issues',
            error: storeError,
          };
        }
      })
      .catch(rejection => {
        console.error('Upload failed:', rejection);
        return {
          success: false,
          error: rejection.error || 'Unknown error',
        };
      });
  } catch (error) {
    console.error('Error in uploadPDF:', error);
    return {
      success: false,
      error: error.message || 'Error processing PDF',
    };
  }
}

// Enhanced PDF server fetching
async function tryFetchFromServer(dataSource, studyUid, seriesUid, instanceUid) {
  try {
    // Get server configuration
    const serverConfig = dataSource.getConfig();
    const wadoRoot = serverConfig.wadoRoot || '';

    // Create storage keys for persistence
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
        sessionStorage.setItem(sessionKey, pdfBase64);
        localStorage.setItem(localKey, pdfBase64);

        console.log(`Successfully retrieved PDF from server at ${url}`);

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

// Try to recover PDF function - can be called on page load
export function tryRecoverPDF(dataSource) {
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

export default uploadPDF;
