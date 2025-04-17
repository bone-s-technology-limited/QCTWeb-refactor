import { DicomMetadataStore } from '../services/DicomMetadataStore/DicomMetadataStore';

function generateCSVContent(results) {
  const csvRows = results.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  const csvString = csvRows.join('\n');
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
}

function normalizeLabel(label) {
  return (label || '').toLowerCase().trim().replace(/\s+/g, '');
}

function isLabelMatch(label, target) {
  const normalizedLabel = normalizeLabel(label);
  console.log(`Comparing labels: "${normalizedLabel}" with target "${target}"`);
  return normalizedLabel.includes(target) || target.includes(normalizedLabel);
}

function findVolumeStats(annotation) {
  // 首先检查annotation.data中的所有键
  const dataKeys = Object.keys(annotation.data || {});

  // 遍历所有键找到包含体积数据的对象
  for (const key of dataKeys) {
    const data = annotation.data[key];
    // 如果找到了包含mean的数据，并且mean不为0，返回这个数据
    if (data && typeof data.mean === 'number' && data.mean !== 0) {
      console.log('Found valid stats in key:', key, data);
      return data;
    }
  }

  // 如果在直接键中没找到，检查cachedStats
  if (annotation.data?.cachedStats) {
    for (const key of Object.keys(annotation.data.cachedStats)) {
      const stats = annotation.data.cachedStats[key];
      if (stats && typeof stats.mean === 'number' && stats.mean !== 0) {
        console.log('Found valid stats in cachedStats:', key, stats);
        return stats;
      }
    }
  }

  // 如果没找到有效数据，返回null
  return null;
}

// 新增函数：从ROI数据中提取或生成HU分布数据
function extractHUDistribution(annotation, stats) {
  console.log('Extracting HU distribution from annotation:', {
    label: annotation.label,
    hasData: !!annotation.data,
    hasStats: !!stats,
  });

  // 首先尝试从annotation.data中找到现有的HU分布
  if (annotation.data?.huDistribution && Array.isArray(annotation.data.huDistribution)) {
    console.log(
      `Found existing HU distribution in annotation.data with ${annotation.data.huDistribution.length} points`
    );
    return annotation.data.huDistribution;
  }

  // 检查是否有其他位置存储的HU分布数据
  if (
    annotation.data?.roiStats?.huDistribution &&
    Array.isArray(annotation.data.roiStats.huDistribution)
  ) {
    console.log(
      `Found HU distribution in roiStats with ${annotation.data.roiStats.huDistribution.length} points`
    );
    return annotation.data.roiStats.huDistribution;
  }

  if (
    annotation.data?.cachedStats?.huDistribution &&
    Array.isArray(annotation.data.cachedStats.huDistribution)
  ) {
    console.log(
      `Found HU distribution in cachedStats with ${annotation.data.cachedStats.huDistribution.length} points`
    );
    return annotation.data.cachedStats.huDistribution;
  }

  // 如果没有找到现有分布，生成一个基于均值和标准差的分布
  const mean = stats.meanHU || stats.mean || 0;
  const stdDev = stats.stdDevHU || stats.stdDev || 10;
  console.log(
    `Generating synthetic HU distribution for ${annotation.label} with mean=${mean}, stdDev=${stdDev}`
  );

  // 基于组织类型调整HU范围
  let startHU,
    endHU,
    binSize = 5;
  const range = stdDev * 3; // 3个标准差的范围

  if (isLabelMatch(annotation.label, 'bone')) {
    // 骨骼通常在~100到1500 HU范围
    startHU = Math.max(0, mean - range / 2);
    endHU = mean + range;
  } else if (isLabelMatch(annotation.label, 'muscle')) {
    // 肌肉通常在~10到100 HU范围
    startHU = Math.max(-20, mean - range / 2);
    endHU = Math.min(120, mean + range / 2);
  } else if (isLabelMatch(annotation.label, 'fat')) {
    // 脂肪通常在~-150到-30 HU范围
    startHU = mean - range / 2;
    endHU = Math.min(0, mean + range / 2);
  } else {
    // 通用范围
    startHU = mean - range;
    endHU = mean + range;
  }

  const distribution = [];
  // 创建符合组织类型的分布形状
  for (let hu = startHU; hu <= endHU; hu += binSize) {
    // 正态分布公式
    const zScore = (hu - mean) / stdDev;
    const height = Math.exp(-0.5 * zScore * zScore) / (stdDev * Math.sqrt(2 * Math.PI));
    // 缩放为可见的频率值
    const scaledHeight = height * stdDev * 30; // 缩放以提高可见度

    // 只添加频率可见的点
    if (scaledHeight > 0.1) {
      distribution.push({
        hu: Math.round(hu),
        frequency: scaledHeight,
      });
    }
  }

  console.log(`Generated ${distribution.length} distribution points for ${annotation.label}`);
  return distribution;
}

function getAnnotationStats(annotation) {
  console.group('Getting annotation stats');
  try {
    console.log('Full annotation object:', annotation);

    // 获取label
    const label = annotation.label || '';
    console.log('Label:', label);

    // 查找有效的统计数据
    const stats = findVolumeStats(annotation);
    console.log('Found stats:', stats);

    if (!stats) {
      // 如果没有找到统计数据，检查是否有roiStats
      if (annotation.data?.roiStats) {
        console.log('Using roiStats:', annotation.data.roiStats);

        // 提取或生成HU分布
        const huDistribution = extractHUDistribution(annotation, annotation.data.roiStats);

        return {
          label,
          meanHU: annotation.data.roiStats.meanHU || 0,
          stdDevHU: annotation.data.roiStats.stdDevHU || 0,
          areaMm2: annotation.data.roiStats.areaMm2 || 0,
          volumeMm3: annotation.data.roiStats.volumeMm3 || 0,
          modalityUnit: 'HU',
          huDistribution,
        };
      }
      console.warn('No valid stats found');
      return null;
    }

    // 提取或生成HU分布
    const huDistribution = extractHUDistribution(annotation, stats);

    // 根据是否有volumeMm3来判断是2D还是3D ROI
    const combinedStats = {
      label,
      meanHU: stats.mean || 0,
      stdDevHU: stats.stdDev || 0,
      areaMm2: stats.area || 0,
      volumeMm3: stats.volumeMm3 || 0,
      modalityUnit: stats.modalityUnit || 'HU',
      huDistribution,
    };

    console.log('Combined stats:', combinedStats);
    return combinedStats;
  } catch (error) {
    console.error('Error getting annotation stats:', error);
    return null;
  } finally {
    console.groupEnd();
  }
}

function getPatientInfo(annotation) {
  try {
    const seriesMetadata = DicomMetadataStore.getSeries(
      annotation.referenceStudyUID,
      annotation.referenceSeriesUID
    );

    if (seriesMetadata?.instances?.[0]) {
      const instance = seriesMetadata.instances[0];
      return {
        'Patient ID': instance.PatientID || '',
        'Patient Name': instance.PatientName?.Alphabetic || '',
        StudyInstanceUID: annotation.referenceStudyUID || '',
        SeriesInstanceUID: annotation.referenceSeriesUID || '',
      };
    }
  } catch (error) {
    console.warn('Error getting patient info:', error);
  }

  return {
    'Patient ID': '',
    'Patient Name': '',
    StudyInstanceUID: annotation.referenceStudyUID || '',
    SeriesInstanceUID: annotation.referenceSeriesUID || '',
  };
}

export default function downloadCSVReport(measurementData) {
  console.group('Starting downloadCSVReport');
  console.log('Initial measurements:', measurementData);

  if (!measurementData || measurementData.length === 0) {
    console.error('No measurement data provided');
    console.groupEnd();
    throw new Error('No measurement data provided');
  }

  const columns = [
    'Patient ID',
    'Patient Name',
    'StudyInstanceUID',
    'SeriesInstanceUID',
    'Label',
    'Mean (HU)',
    'StdDev (HU)',
    'Area (mm²)',
    'Volume (mm³)',
  ];

  let patientInfo = null;
  const results = [columns];
  const measurements = [];

  console.log('Processing measurements...');

  const availableLabels = measurementData.map(m => m.label).filter(Boolean);
  console.log('Available labels:', availableLabels);

  // 首先处理bone数据，因为它通常会有正确的数据
  let sortedData = [
    ...measurementData.filter(m => m.label === 'bone'),
    ...measurementData.filter(m => m.label !== 'bone'),
  ];

  sortedData.forEach((annotation, index) => {
    console.group(`Processing annotation ${index + 1}`);

    try {
      const stats = getAnnotationStats(annotation);
      if (!stats) {
        console.warn('No valid stats found for annotation');
        console.groupEnd();
        return;
      }

      if (!patientInfo) {
        patientInfo = getPatientInfo(annotation);
        console.log('Retrieved patient info:', patientInfo);
      }

      const measurementInfo = {
        originalLabel: annotation.label || '',
        normalizedLabel: normalizeLabel(annotation.label || ''),
        meanHU: stats.meanHU,
        stdDevHU: stats.stdDevHU,
        areaMm2: stats.areaMm2,
        volumeMm3: stats.volumeMm3,
        huDistribution: stats.huDistribution,
        patientInfo: patientInfo,
      };

      console.log('Created measurement info:', measurementInfo);
      measurements.push(measurementInfo);

      const resultRow = [
        measurementInfo.patientInfo['Patient ID'],
        measurementInfo.patientInfo['Patient Name'],
        measurementInfo.patientInfo.StudyInstanceUID,
        measurementInfo.patientInfo.SeriesInstanceUID,
        measurementInfo.originalLabel,
        measurementInfo.meanHU?.toFixed(2) || '0',
        measurementInfo.stdDevHU?.toFixed(2) || '0',
        measurementInfo.areaMm2?.toFixed(2) || '0',
        measurementInfo.volumeMm3?.toFixed(2) || '0',
      ];

      results.push(resultRow);
      console.log('Added CSV row:', resultRow);
    } catch (error) {
      console.error('Error processing annotation:', error);
    } finally {
      console.groupEnd();
    }
  });

  console.log('All processed measurements:', measurements);

  if (measurements.length === 0) {
    throw new Error('No valid measurements found in the data');
  }

  const huValues = {
    fat: measurements.find(m => m.originalLabel === 'fat')?.meanHU || 0,
    muscle: measurements.find(m => m.originalLabel === 'muscle')?.meanHU || 0,
    bone: measurements.find(m => m.originalLabel === 'bone')?.meanHU || 0,
  };

  console.log('Found HU values:', huValues);

  if (!huValues.fat || !huValues.muscle || !huValues.bone) {
    const errorMessage =
      'Missing or invalid measurements.\n' +
      `Available measurements: ${availableLabels.join(', ')}\n` +
      'Found values:\n' +
      `Bone: ${huValues.bone} HU\n` +
      `Fat: ${huValues.fat} HU\n` +
      `Muscle: ${huValues.muscle} HU\n\n` +
      'Please ensure all ROIs are properly drawn and measurements are calculated.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const bmdFatMuscle = [-87.75, 38.76];
  const huFatMuscle = [huValues.fat, huValues.muscle];
  const slope = (bmdFatMuscle[1] - bmdFatMuscle[0]) / (huFatMuscle[1] - huFatMuscle[0]);
  const intercept = bmdFatMuscle[0] - slope * huFatMuscle[0];
  const bmd = Number((slope * huValues.bone + intercept).toFixed(2));

  console.log('BMD calculation:', {
    fatHU: huValues.fat,
    muscleHU: huValues.muscle,
    boneHU: huValues.bone,
    slope,
    intercept,
    calculatedBMD: bmd,
  });

  // 将ROI数据按类型归类
  const roiData = {
    bone: measurements.find(m => isLabelMatch(m.originalLabel, 'bone')),
    muscle: measurements.find(m => isLabelMatch(m.originalLabel, 'muscle')),
    fat: measurements.find(m => isLabelMatch(m.originalLabel, 'fat')),
  };

  // 准备返回的结果，包含HU分布数据
  const result = {
    patient_info: patientInfo,
    hu_values: huValues,
    bmd,
    roiData: {
      bone: roiData.bone
        ? {
            meanHU: roiData.bone.meanHU,
            stdDevHU: roiData.bone.stdDevHU,
            huDistribution: roiData.bone.huDistribution,
          }
        : null,
      muscle: roiData.muscle
        ? {
            meanHU: roiData.muscle.meanHU,
            stdDevHU: roiData.muscle.stdDevHU,
            huDistribution: roiData.muscle.huDistribution,
          }
        : null,
      fat: roiData.fat
        ? {
            meanHU: roiData.fat.meanHU,
            stdDevHU: roiData.fat.stdDevHU,
            huDistribution: roiData.fat.huDistribution,
          }
        : null,
    },
    csvContent: generateCSVContent(results),
  };

  console.log('Final result:', result);
  console.groupEnd();
  return result;
}
