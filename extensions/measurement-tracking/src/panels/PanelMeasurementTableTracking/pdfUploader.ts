import { data } from 'dcmjs';
import DicomFileUploader, {
  UploadRejection,
} from '../../../../cornerstone/src/utils/DicomFileUploader';
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

// 将ArrayBuffer转换为Base64字符串
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// 确保对象可以安全转换为JSON
function makeJSONSafe(obj) {
  if (!obj) {
    return obj;
  }
  if (obj instanceof ArrayBuffer) {
    return {
      _type: 'ArrayBuffer',
      _byteLength: obj.byteLength,
    };
  }
  if (typeof obj !== 'object') {
    return obj;
  }

  const newObj = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[key] = makeJSONSafe(obj[key]);
    }
  }
  return newObj;
}

function getDICOMFromJSONDataset(dataset) {
  console.log('getDICOMFromJSONDataset - 输入数据集:', makeJSONSafe(dataset));
  try {
    // 创建工作副本，避免修改原始对象
    const workingDataset = { ...dataset };

    // 恢复原始的ArrayBuffer，如果我们使用了特殊的对象结构
    if (workingDataset._vrMap && workingDataset._vrMap.EncapsulatedDocument === 'OB') {
      if (
        workingDataset.EncapsulatedDocument &&
        workingDataset.EncapsulatedDocument._pdfArrayBuffer
      ) {
        console.log('从_pdfArrayBuffer恢复ArrayBuffer数据用于DICOM文件创建');
        workingDataset.EncapsulatedDocument = workingDataset.EncapsulatedDocument._pdfArrayBuffer;
      }
    }

    // 确保元数据字段正确
    if (!workingDataset._meta) {
      throw new Error('数据集中缺少_meta');
    }

    const denaturalizedMetaHeader = DicomMetaDictionary.denaturalizeDataset(workingDataset._meta);
    const dicomDict = new DicomDict(denaturalizedMetaHeader);
    dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(workingDataset);

    // 使用正确的分片设置生成DICOM缓冲区
    const dicomBuffer = dicomDict.write();
    console.log('生成的DICOM缓冲区大小:', dicomBuffer.byteLength, '字节');

    // 创建DICOM文件并保存
    const dicomBlob = new Blob([dicomBuffer], { type: 'application/dicom' });
    const url = window.URL.createObjectURL(dicomBlob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().getTime();
    a.download = `encapsulated_pdf_${timestamp}.dcm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return dicomBlob;
  } catch (error) {
    console.error('getDICOMFromJSONDataset - 错误:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
}

function getJSONDatasetOfEncapsulatedPDF(pdfArrayBuffer, instance) {
  console.log(
    'getJSONDatasetOfEncapsulatedPDF - 输入pdfArrayBuffer类型:',
    Object.prototype.toString.call(pdfArrayBuffer)
  );
  console.log(
    'getJSONDatasetOfEncapsulatedPDF - 输入pdfArrayBuffer大小:',
    pdfArrayBuffer.byteLength,
    '字节'
  );

  // 确保pdfArrayBuffer是正确的类型
  if (!(pdfArrayBuffer instanceof ArrayBuffer)) {
    throw new Error('PDF数据必须是ArrayBuffer类型');
  }

  // 检查PDF头部以确认是有效的PDF
  const pdfHeader = new Uint8Array(pdfArrayBuffer.slice(0, 5));
  const isPDF = String.fromCharCode.apply(null, pdfHeader) === '%PDF-';
  if (!isPDF) {
    console.warn('警告: 输入数据似乎不是有效的PDF (没有找到%PDF-头)');
  }

  // 创建日期时间
  const dateTime = _getCurrentDateTime();

  // 生成UIDs
  const seriesInstanceUid = DicomMetaDictionary.uid();
  const sopInstanceUid = DicomMetaDictionary.uid();

  // 确保PDF数据长度为偶数（DICOM要求）
  let pdfData = pdfArrayBuffer;
  const pdfSize = pdfArrayBuffer.byteLength;
  if (pdfSize % 2 !== 0) {
    console.log('PDF大小为奇数字节，添加填充...');
    const paddedBuffer = new ArrayBuffer(pdfSize + 1);
    const paddedView = new Uint8Array(paddedBuffer);
    paddedView.set(new Uint8Array(pdfArrayBuffer));
    paddedView[pdfSize] = 0x00; // 添加填充字节
    pdfData = paddedBuffer;
  }

  // 创建Blob和URL用于直接访问PDF
  const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);
  console.log('创建的PDF URL:', pdfUrl);

  // 转换为Base64以用于InlineBinary
  const base64PDF = arrayBufferToBase64(pdfData);
  console.log('创建的Base64 PDF长度:', base64PDF.length);

  // 保存原始ArrayBuffer以便后续处理
  const originalBuffer = pdfData.slice(0);

  // 构建完整的DICOM数据集
  const dataset = {
    _vrMap: {
      EncapsulatedDocument: 'OB',
    },
    _meta: {
      _vrMap: {},
      FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      MediaStorageSOPClassUID: EncapsulatedPdfSopClassUid,
      MediaStorageSOPInstanceUID: sopInstanceUid,
      TransferSyntaxUID: ExplicitVrLittleEndianTransferSyntaxUid,
      ImplementationClassUID: ImplementationUid,
    },

    // 必需的Patient属性
    PatientID: instance.PatientID || '',
    PatientName: instance.PatientName || '',
    PatientBirthDate: instance.PatientBirthDate || '',
    PatientSex: instance.PatientSex || '',

    // 必需的Study属性
    StudyInstanceUID: instance.StudyInstanceUID || DicomMetaDictionary.uid(),
    StudyDate: dateTime.date,
    StudyTime: dateTime.time,
    StudyID: instance.StudyID || '',
    AccessionNumber: instance.AccessionNumber || '',
    ReferringPhysicianName: instance.ReferringPhysicianName || '',
    StudyDescription: instance.StudyDescription || 'BMD Report',

    // 必需的Series属性
    Modality: 'DOC',
    SeriesInstanceUID: seriesInstanceUid,
    SeriesNumber: instance.SeriesNumber ? parseInt(instance.SeriesNumber) + 1 : 1,
    SeriesDate: dateTime.date,
    SeriesTime: dateTime.time,
    SeriesDescription: 'BMD Report PDF',

    // 文档属性
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
    // 设置为ArrayBuffer用于dcmjs转换
    EncapsulatedDocument: pdfData,
    BurnedInAnnotation: 'YES',

    // 添加实例相关属性
    SOPClassUID: EncapsulatedPdfSopClassUid,
    SOPInstanceUID: sopInstanceUid,
    InstanceNumber: 1,
    SpecificCharacterSet: 'ISO_IR 192', // UTF-8

    // 添加图像注释信息
    Manufacturer: 'OHIF Viewer',
    ManufacturerModelName: 'BMD Reporting System',
  };

  console.log('成功生成带有完整元数据的数据集');

  // 返回完整数据集和一些额外信息用于后续处理
  return {
    dataset,
    pdfUrl,
    base64PDF,
    originalBuffer,
    seriesInstanceUid,
    sopInstanceUid,
  };
}

function uploadPDF(pdf, dataSource, instance) {
  try {
    console.log('开始PDF上传过程');

    // 检查pdf对象是否有效
    if (!pdf || typeof pdf.output !== 'function') {
      throw new Error('无效的PDF对象');
    }

    // 检查instance对象是否有效
    if (!instance || !instance.StudyInstanceUID) {
      throw new Error('无效的DICOM实例对象');
    }

    // 获取PDF的ArrayBuffer，使用二进制格式以保证数据完整性
    const pdfArrayBuffer = pdf.output('arraybuffer');
    console.log('PDF ArrayBuffer大小:', pdfArrayBuffer.byteLength, '字节');

    // 转换为DICOM dataset及相关信息
    const { dataset, pdfUrl, base64PDF, originalBuffer, seriesInstanceUid, sopInstanceUid } =
      getJSONDatasetOfEncapsulatedPDF(pdfArrayBuffer, instance);

    // 转换为DICOM文件
    const file = getDICOMFromJSONDataset(dataset);

    // 上传文件
    console.log('开始DICOM文件上传');
    const fileUploader = new DicomFileUploader(file, dataSource);
    fileUploader
      .load()
      .then(() => {
        console.log('上传成功完成');

        try {
          // 创建一个视图友好版本的实例对象用于UI显示
          const viewFriendlyInstance = {
            ...instance, // 保留原实例信息

            // 更新为新生成的UID
            SeriesInstanceUID: seriesInstanceUid,
            SOPInstanceUID: sopInstanceUid,
            SOPClassUID: EncapsulatedPdfSopClassUid,

            // 添加必要的PDF相关属性
            Modality: 'DOC',
            SeriesDescription: 'BMD Report PDF',
            MIMETypeOfEncapsulatedDocument: 'application/pdf',
            DocumentTitle: 'BMD Report',

            EncapsulatedDocument: {
              DirectRetrieveURL: pdfUrl,
              InlineBinary: base64PDF,
            },
          };

          // 直接将修改后的实例添加到DicomMetadataStore
          console.log('添加视图友好实例到DicomMetadataStore');
          DicomMetadataStore.addInstances([viewFriendlyInstance], true);

          alert('报告上传成功');
        } catch (storeError) {
          console.error('添加到DicomMetadataStore时出错:', storeError);
          alert('报告上传成功，但显示可能存在问题');
        }
      })
      .catch(rejection => {
        console.error('上传失败:', rejection);
        alert(`上传失败: ${rejection.error || '未知错误'}`);
      });
  } catch (error) {
    console.error('uploadPDF中的错误:', error);
    alert(`处理PDF时出错: ${error.message}`);
  }
}

export default uploadPDF;
