import React, { useEffect, useState, useRef } from 'react';
import uploadPDF from './pdfUploader';
import { convertBMDReportToPDF } from './BMDreport';

const ReportModal = ({
  dataSource,
  instance,
  processedMeasurements,
  patientInfo,
  hospitalInfo,
  scanParams,
}) => {
  const [pdf, setPdf] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadErrorDetails, setUploadErrorDetails] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    const generatePDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!processedMeasurements || !patientInfo || !hospitalInfo) {
          throw new Error('缺少生成报告所需的必要数据');
        }

        const generatedPDF = await convertBMDReportToPDF(
          processedMeasurements,
          patientInfo,
          hospitalInfo,
          scanParams || {}
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
  }, [processedMeasurements, patientInfo, hospitalInfo, scanParams]);

  const handleDownload = () => {
    if (!pdf) return;

    // Create filename based on patient info
    const patientId = patientInfo?.id || 'unknown';
    const examDate = patientInfo?.examDate || new Date().toLocaleDateString().replace(/\//g, '');
    const filename = `BMD_Report_${patientId}_${examDate}.pdf`;

    // Download the PDF
    pdf.save(filename);
  };

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadSuccess(false);
    setUploadErrorDetails(null);

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
      const result = await uploadPDF(pdf, dataSource, instance);

      // Restore original alert
      window.alert = originalAlert;

      if (result.success) {
        setUploadSuccess(true);
      } else {
        setUploadErrorDetails(result.error || '上传失败，未知错误');
      }
    } catch (error) {
      console.error('Error during upload:', error);
      setUploadErrorDetails(error.message || '上传失败，未知错误');
    } finally {
      setIsUploading(false);
    }
  };

  // Function to toggle error details
  const toggleErrorDetails = () => {
    setIsExpanded(!isExpanded);
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

  if (error && !pdfUrl) {
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
      <div className="min-h-14 flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex flex-col">
          {uploadSuccess && <div className="text-sm text-green-400">报告上传成功！</div>}
          {uploadErrorDetails && (
            <div className="text-sm text-red-400">
              <span
                className="cursor-pointer underline"
                onClick={toggleErrorDetails}
              >
                {isExpanded ? '隐藏错误详情' : '显示错误详情'}
              </span>
              {isExpanded && (
                <div className="mt-1 max-w-md rounded bg-red-900/20 p-2 text-xs">
                  {uploadErrorDetails}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex space-x-4">
          <button
            onClick={handleDownload}
            className="rounded bg-green-600 px-6 py-2.5 text-sm text-white transition-colors duration-200 hover:bg-green-700"
          >
            保存到本地
          </button>

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
              '上传到PACS'
            )}
          </button>
        </div>
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
