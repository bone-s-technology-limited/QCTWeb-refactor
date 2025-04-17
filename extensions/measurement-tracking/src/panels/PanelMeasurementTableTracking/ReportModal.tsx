import React, { useEffect, useState, useRef } from 'react';
import uploadPDF from './pdfUploader';
import { convertBMDReportToPDF } from './BMDreport';

const ReportModal = ({
  dataSource,
  instance,
  processedMeasurements,
  patientInfo,
  hospitalInfo,
}) => {
  const [pdf, setPdf] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    const generatePDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!processedMeasurements || !patientInfo || !hospitalInfo) {
          throw new Error('Missing required data for PDF generation');
        }

        const generatedPDF = await convertBMDReportToPDF(
          processedMeasurements,
          patientInfo,
          hospitalInfo,
          {}
        );

        setPdf(generatedPDF);
        const blob = new Blob([generatedPDF.output('blob')], {
          type: 'application/pdf',
        });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (error) {
        console.error('Error generating PDF:', error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    generatePDF();

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [processedMeasurements, patientInfo, hospitalInfo]);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadSuccess(false);
    try {
      // Add a listener for the alert to track upload success/failure
      const originalAlert = window.alert;
      window.alert = message => {
        if (message.includes('upload') && message.includes('success')) {
          setUploadSuccess(true);
        }
        originalAlert(message);
      };

      // Upload the PDF
      await uploadPDF(pdf, dataSource, instance);

      // Restore original alert
      window.alert = originalAlert;
    } catch (error) {
      console.error('Error during upload:', error);
      setError('Failed to upload report: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-black bg-opacity-50">
        <div className="flex flex-col items-center">
          {/* Rotating loading animation */}
          <div className="loader-container">
            <div className="loader"></div>
          </div>
          {/* Text description */}
          <div className="mt-2 text-xl text-white">正在生成报告，请稍候...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-black bg-opacity-50">
        <div className="rounded-lg bg-white p-6 text-xl text-red-500 shadow-lg">错误: {error}</div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden bg-[#090c29]"
      style={{ height: '800px' }}
    >
      {/* Top toolbar - fixed height */}
      <div className="flex h-14 items-center justify-between px-4 py-1">
        <div>{uploadSuccess && <div className="text-sm text-green-400">报告上传成功！</div>}</div>
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className={`rounded px-6 py-2.5 text-sm text-white transition-colors duration-200 ${
            isUploading ? 'cursor-not-allowed bg-gray-500' : 'bg-[#0944b3] hover:bg-[#0837a3]'
          }`}
        >
          {isUploading ? (
            <span className="flex items-center">
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-white"></span>
              上传中...
            </span>
          ) : (
            '上传报告'
          )}
        </button>
      </div>

      {/* PDF display area - adaptive height */}
      <div className="flex flex-1 justify-center overflow-auto bg-[#090c29] p-4">
        <div className="relative min-h-full w-full max-w-5xl bg-white shadow-lg">
          {pdfUrl && (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              className="absolute h-full w-full border-0 p-4"
              title="BMD Report"
            />
          )}
        </div>
      </div>
    </div>
  );
};

const style = document.createElement('style');
style.textContent = `
.loader {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #0944b3;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);

export default ReportModal;
