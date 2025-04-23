import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { useViewportGrid, ActionButtons, useModal } from '@ohif/ui';
import { DicomMetadataStore, utils } from '@ohif/core';
import { useAppConfig } from '@state';
import { useTrackedMeasurements } from '../../getContextModule';
import { useTranslation } from 'react-i18next';
import { Separator } from '@ohif/ui-next';
import ReportModal from './ReportModal';
import HUDistributionChart from './HUDistributionCharts';
import { getAnnotations } from '@cornerstonejs/tools';

const { downloadCSVReport } = utils;
const { formatDate } = utils;

// 自定义事件常量，以防measurementService.EVENTS未定义
const MEASUREMENT_EVENTS = {
  MEASUREMENT_MODIFIED: 'MEASUREMENT_MODIFIED',
  MEASUREMENT_COMPLETED: 'MEASUREMENT_COMPLETED',
};

interface ScanParameters {
  kvp: string;
  bedHeight: string;
  thickness: string;
  scanField: string;
  ma: string;
  bedRotation: string;
  collimation: string;
  kernel: string;
}

interface DataPoint {
  hu: number;
  frequency: number;
}

interface ROIStats {
  meanHU: number;
  stdDevHU: number;
  areaMm2?: number;
  volumeMm3?: number;
  numPixels?: number;
  numVoxels?: number;
  huDistribution: DataPoint[];
}

interface BMDResultsProps {
  results: {
    bone?: ROIStats;
    muscle?: ROIStats;
    fat?: ROIStats;
    bmd?: number;
    tScore?: number;
    zScore?: number;
    diagnosis?: string;
  } | null;
}

// 创建自动消失的提示组件
interface AutoDismissAlertProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
  type?: 'info' | 'warning' | 'success' | 'error';
}

const AutoDismissAlert: React.FC<AutoDismissAlertProps> = ({
  message,
  duration = 5000,
  onDismiss,
  type = 'info',
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  // 根据类型选择不同的背景样式
  let bgClass = '';
  let textClass = '';

  switch (type) {
    case 'warning':
      bgClass = 'bg-yellow-500/15';
      textClass = 'text-yellow-300';
      break;
    case 'error':
      bgClass = 'bg-red-500/15';
      textClass = 'text-red-400';
      break;
    case 'success':
      bgClass = 'bg-green-500/15';
      textClass = 'text-green-400';
      break;
    case 'info':
    default:
      bgClass = 'bg-blue-500/15';
      textClass = 'text-blue-300';
  }

  return (
    <div className={`rounded p-3 ${bgClass} animate-fadeIn mb-4 flex items-center justify-between`}>
      <div className={`${textClass} text-sm`}>{message}</div>
      <button
        onClick={onDismiss}
        className="text-gray-400 transition-colors hover:text-white"
      >
        ✕
      </button>
    </div>
  );
};

const BMDResults: React.FC<BMDResultsProps> = ({ results }) => {
  // Early return if no results
  if (!results) {
    return null;
  }

  const { bone, muscle, fat, bmd = 0, tScore = 0, zScore = 0, diagnosis = '未知' } = results;

  // Debug logging to help identify issues
  if (process.env.NODE_ENV !== 'production') {
    console.log('BMD Results Component Data:', {
      bone: bone
        ? {
            meanHU: bone.meanHU,
            stdDevHU: bone.stdDevHU,
            huDistribution: bone.huDistribution
              ? `${bone.huDistribution.length} points`
              : 'undefined',
          }
        : null,
      muscle: muscle
        ? {
            meanHU: muscle.meanHU,
            stdDevHU: muscle.stdDevHU,
            huDistribution: muscle.huDistribution
              ? `${muscle.huDistribution.length} points`
              : 'undefined',
          }
        : null,
      fat: fat
        ? {
            meanHU: fat.meanHU,
            stdDevHU: fat.stdDevHU,
            huDistribution: fat.huDistribution
              ? `${fat.huDistribution.length} points`
              : 'undefined',
          }
        : null,
    });
  }

  // Validate distribution data
  const validateDistribution = (data?: DataPoint[] | null): DataPoint[] => {
    console.log('Validating distribution data:', {
      exists: !!data,
      isArray: Array.isArray(data),
      length: data?.length || 0,
      sample: data?.slice(0, 3) || 'none',
    });

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('Invalid or empty HU distribution data, creating synthetic data');

      // Generate tissue-specific defaults based on the results we have
      const defaults: DataPoint[] = [];
      let baseMean = 0;
      let baseStdDev = 10;

      if (results) {
        if (bone && bone.meanHU) {
          baseMean = bone.meanHU;
          baseStdDev = bone.stdDevHU || 20;
        } else if (muscle && muscle.meanHU) {
          baseMean = muscle.meanHU;
          baseStdDev = muscle.stdDevHU || 10;
        } else if (fat && fat.meanHU) {
          baseMean = fat.meanHU;
          baseStdDev = fat.stdDevHU || 15;
        }
      }

      // Create a more visible distribution
      for (let i = -3; i <= 3; i += 0.5) {
        const hu = Math.round(baseMean + i * baseStdDev);
        const gaussian = Math.exp(-0.5 * i * i);
        defaults.push({
          hu: hu,
          frequency: gaussian * 20, // Scale for visibility
        });
      }

      console.log('Created synthetic distribution:', {
        points: defaults.length,
        sample: defaults.slice(0, 3),
      });

      return defaults;
    }

    // Filter out zero-frequency entries which can cause rendering issues
    const filtered = data.filter(point => point.frequency > 0);
    console.log('Distribution after filtering:', {
      original: data.length,
      filtered: filtered.length,
    });

    // If filtering removed all points, return a default point
    if (filtered.length === 0) {
      console.warn('No points with non-zero frequency, creating default point');
      return [
        {
          hu: data[0]?.hu || 0,
          frequency: 1, // Ensure visible
        },
      ];
    }

    return filtered;
  };

  return (
    <div className="space-y-2">
      {/* 基本统计信息部分 */}
      <div className="rounded bg-[#0f1729] p-3">
        <div className="mb-2 text-sm font-medium text-white">BMD 计算结果</div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="grid grid-cols-2 gap-1">
            {bone && (
              <div className="flex justify-between">
                <span className="text-gray-400">骨骼 HU:</span>
                <span className="text-white">{bone.meanHU.toFixed(2)}</span>
              </div>
            )}
            {fat && (
              <div className="flex justify-between">
                <span className="text-gray-400">脂肪 HU:</span>
                <span className="text-white">{fat.meanHU.toFixed(2)}</span>
              </div>
            )}
            {muscle && (
              <div className="flex justify-between">
                <span className="text-gray-400">肌肉 HU:</span>
                <span className="text-white">{muscle.meanHU.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* BMD值单独一行显示 */}
          {bmd > 0 && (
            <div className="flex justify-between border-t border-[#1e293b] py-1">
              <span className="text-gray-400">BMD值:</span>
              <span className="text-white">{bmd.toFixed(1)} mg/cc</span>
            </div>
          )}

          {(tScore !== 0 || zScore !== 0) && (
            <div className="grid grid-cols-2 gap-1">
              <div className="flex justify-between">
                <span className="text-gray-400">T值:</span>
                <span className="text-white">{tScore.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Z值:</span>
                <span className="text-white">{zScore.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between border-t border-[#1e293b] pt-1">
            <span className="text-gray-400">诊断结果:</span>
            <span className="text-white">{diagnosis}</span>
          </div>
        </div>
      </div>

      {/* HU分布图部分 - 添加meanHU属性 */}
      <div className="space-y-2">
        {bone && (
          <HUDistributionChart
            data={validateDistribution(bone.huDistribution)}
            type="bone"
            meanHU={bone.meanHU} // 传入平均值
          />
        )}
        {muscle && (
          <HUDistributionChart
            data={validateDistribution(muscle.huDistribution)}
            type="muscle"
            meanHU={muscle.meanHU} // 传入平均值
          />
        )}
        {fat && (
          <HUDistributionChart
            data={validateDistribution(fat.huDistribution)}
            type="fat"
            meanHU={fat.meanHU} // 传入平均值
          />
        )}
      </div>
    </div>
  );
};

const VERTEBRAE_OPTIONS = ['T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];

function PanelMeasurementTableTracking({
  servicesManager,
  extensionManager,
  renderHeader,
  getCloseIcon,
  tab,
}) {
  const { t } = useTranslation('MeasurementTable');
  const { measurementService, customizationService, displaySetService, uiDialogService } =
    servicesManager.services;
  const [trackedMeasurements] = useTrackedMeasurements();
  const { trackedStudy, trackedSeries } = trackedMeasurements.context;
  const [bmdResults, setBmdResults] = useState(null);
  const [bmdError, setBmdError] = useState(null);
  const [selectedVertebraLocation, setSelectedVertebraLocation] = useState('');
  const [isVertebraConfirmed, setIsVertebraConfirmed] = useState(false);
  const [appConfig] = useAppConfig();
  const autoUpdateTimerRef = useRef(null);

  // 新增：ROI调整提示状态
  const [showROIAdjustmentAlert, setShowROIAdjustmentAlert] = useState(false);
  // 新增：追踪ROI是否已被修改
  const [roiModified, setRoiModified] = useState(false);

  const { show } = useModal();

  // 检查是否有有效的测量数据
  const hasMeasurements = () => {
    const measurements = measurementService.getMeasurements();
    return measurements && measurements.length > 0;
  };

  const VertebraConfirmDialog = ({ id, vertebra }: { id: string; vertebra: string }) => {
    const handleConfirm = () => {
      setSelectedVertebraLocation(vertebra);
      setIsVertebraConfirmed(true);
      uiDialogService.dismiss({ id });
    };

    const handleCancel = () => {
      setSelectedVertebraLocation('');
      setIsVertebraConfirmed(false);
      uiDialogService.dismiss({ id });
    };

    return (
      <div className="bg-primary-dark rounded-lg p-6">
        <h3 className="mb-4 text-lg font-medium text-white">确认节段</h3>
        <p className="text-primary-light mb-6">您确定选择 {vertebra} 作为当前测量的椎体节段吗？</p>
        <div className="flex justify-end space-x-3">
          <button
            className="rounded bg-blue-500/10 px-4 py-2 text-white transition-colors hover:bg-blue-500/20"
            onClick={handleCancel}
          >
            取消
          </button>
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
            onClick={handleConfirm}
          >
            确认
          </button>
        </div>
      </div>
    );
  };

  const handleVertebraSelection = (vertebra: string) => {
    const dialogId = 'vertebra-confirm-dialog';
    uiDialogService.create({
      id: dialogId,
      content: VertebraConfirmDialog,
      contentProps: {
        id: dialogId,
        vertebra,
      },
      defaultPosition: {
        x: 0,
        y: 0,
      },
      centralize: true,
      showOverlay: true,
      isDraggable: false,
      preservePosition: false,
      onStart: () => {},
      onDrag: () => {},
      onStop: () => {},
    });
  };

  // 在椎体确认后自动计算BMD
  useEffect(() => {
    if (isVertebraConfirmed && selectedVertebraLocation) {
      // 首次确认节段时计算一次 BMD
      calculateBMD();
      // 重置ROI修改状态
      setRoiModified(false);
    }
  }, [isVertebraConfirmed, selectedVertebraLocation]);

  // 修复后的事件监听代码
  useEffect(() => {
    // 监听测量变化
    const handleMeasurementModified = () => {
      console.log('测量数据已修改，触发自动更新');

      // 只有在已经确认椎体节段后才考虑ROI修改
      if (isVertebraConfirmed && selectedVertebraLocation) {
        // 标记ROI已被修改，并显示更新提示
        setRoiModified(true);
        setShowROIAdjustmentAlert(true);

        // 使用防抖处理，避免频繁触发提示
        if (autoUpdateTimerRef.current) {
          clearTimeout(autoUpdateTimerRef.current);
        }

        // 这里不再自动计算BMD，而是提示用户手动点击更新按钮
        console.log('ROI已修改，等待用户手动更新BMD计算');
      }
    };

    // 初始化取消订阅函数
    let unsubscribeMeasurementModified = () => {};
    let unsubscribeMeasurementCompleted = () => {};

    // 检查measurementService是否存在且有subscribe方法
    if (measurementService && typeof measurementService.subscribe === 'function') {
      try {
        // 尝试获取支持的事件类型
        const events = measurementService.EVENTS || MEASUREMENT_EVENTS;

        // 记录可用的事件类型，帮助调试
        console.log('Available measurement events:', events);

        // 尝试订阅可能的事件名
        const eventsToTry = [
          events.MEASUREMENT_MODIFIED,
          events.MEASUREMENT_COMPLETED,
          events.measurementModified,
          events.measurementCompleted,
          'MEASUREMENT_MODIFIED',
          'MEASUREMENT_COMPLETED',
          'measurementModified',
          'measurementCompleted',
        ].filter(Boolean); // 过滤掉undefined值

        // 尝试订阅第一个可用的事件
        for (const eventName of eventsToTry) {
          try {
            console.log(`尝试订阅事件: ${eventName}`);
            unsubscribeMeasurementModified = measurementService.subscribe(
              eventName,
              handleMeasurementModified
            );
            console.log(`成功订阅事件: ${eventName}`);
            break; // 成功订阅一个事件后就退出循环
          } catch (e) {
            console.warn(`订阅事件 ${eventName} 失败:`, e);
            // 继续尝试下一个事件
          }
        }

        // 如果没有成功订阅任何事件，使用轮询作为后备方案
        if (typeof unsubscribeMeasurementModified !== 'function') {
          console.warn('未能订阅任何测量事件，将使用轮询作为备选方案');
          const pollInterval = setInterval(handleMeasurementModified, 2000);
          unsubscribeMeasurementModified = () => clearInterval(pollInterval);
        }
      } catch (e) {
        console.error('订阅测量事件时发生错误:', e);
      }
    } else {
      console.error('measurementService 不存在或没有 subscribe 方法');
    }

    // 组件卸载时清理
    return () => {
      if (typeof unsubscribeMeasurementModified === 'function') {
        try {
          unsubscribeMeasurementModified();
        } catch (e) {
          console.warn('取消订阅时发生错误:', e);
        }
      }

      if (typeof unsubscribeMeasurementCompleted === 'function') {
        try {
          unsubscribeMeasurementCompleted();
        } catch (e) {
          console.warn('取消订阅时发生错误:', e);
        }
      }

      if (autoUpdateTimerRef.current) {
        clearTimeout(autoUpdateTimerRef.current);
      }
    };
  }, [isVertebraConfirmed, selectedVertebraLocation, measurementService]);

  // 更新后的BMD计算函数 - 使用修改后的downloadCSVReport
  const calculateBMD = () => {
    try {
      // 验证已选择椎体位置
      if (!selectedVertebraLocation) {
        throw new Error('请先选择测量节段');
      }

      // 获取测量服务相关数据
      const measurements = measurementService.getMeasurements();
      const trackedMeasurements = measurements.filter(
        m => trackedStudy === m.referenceStudyUID && trackedSeries.includes(m.referenceSeriesUID)
      );

      if (!trackedMeasurements.length) {
        throw new Error('未找到有效的测量数据');
      }

      // 使用修改后的downloadCSVReport函数获取结果，包含HU分布
      const results = downloadCSVReport(trackedMeasurements);
      console.log('Measurement results with HU distribution:', results);

      // 获取患者信息
      const studyMeta = DicomMetadataStore.getStudy(trackedStudy);
      if (!studyMeta?.series?.[0]?.instances?.[0]) {
        throw new Error('无法获取患者信息');
      }

      const instanceMeta = studyMeta.series[0].instances[0];
      const patientAge = instanceMeta.PatientAge || '50';
      const patientGender = instanceMeta.PatientSex || 'F';

      // 计算BMD指标
      const bmdMetrics = calculateBMDMetrics(results.bmd, patientAge, patientGender);

      // 组合结果数据
      const finalResults = {
        bone: results.roiData.bone,
        muscle: results.roiData.muscle,
        fat: results.roiData.fat,
        bmd: bmdMetrics.bmd,
        tScore: bmdMetrics.tScore,
        zScore: bmdMetrics.zScore,
        diagnosis: bmdMetrics.diagnosis,
      };

      console.log('Final BMD results:', finalResults);

      // 更新结果状态
      setBmdResults(finalResults);

      // 清除错误状态
      setBmdError(null);

      // 重置ROI修改状态和提示
      setRoiModified(false);
      setShowROIAdjustmentAlert(false);

      // 记录计算结果
      console.log('BMD calculation completed:', {
        selectedVertebraLocation,
        bmdMetrics,
      });
    } catch (err) {
      // 错误处理
      console.error('Error calculating BMD:', err);
      setBmdError(err instanceof Error ? err.message : '计算BMD时发生错误');
      setBmdResults(null);
    }
  };

  // BMD指标计算函数
  const calculateBMDMetrics = (bmd: number, age: string, gender: string = 'F') => {
    const SD = 29;

    const getChinaReference = (calculationAge: number): number => {
      if (gender === 'M') {
        return -1.5063 * calculationAge + 208.24;
      }
      return (
        3.67378408e-8 * Math.pow(calculationAge, 6) -
        1.30224967e-5 * Math.pow(calculationAge, 5) +
        1.82172603e-3 * Math.pow(calculationAge, 4) -
        1.2671986e-1 * Math.pow(calculationAge, 3) +
        4.510479 * Math.pow(calculationAge, 2) -
        77.2835444 * calculationAge +
        673.453445
      );
    };

    const youngAdultReference = getChinaReference(30);
    const tScore = (bmd - youngAdultReference) / SD;

    const ageNumber = parseInt(age) || 50;
    const ageMatchedReference = getChinaReference(ageNumber);
    const zScore = (bmd - ageMatchedReference) / SD;

    // 根据BMD值确定诊断结果
    let diagnosis = '';
    let severity = 0;
    if (bmd > 120) {
      diagnosis = '正常';
      severity = 0;
    } else if (bmd < 80) {
      diagnosis = '骨质疏松';
      severity = 2;
    } else {
      diagnosis = '低骨量';
      severity = 1;
    }

    return {
      bmd,
      tScore,
      zScore,
      diagnosis,
      severity,
    };
  };

  const handleCreateReport = async () => {
    try {
      if (!bmdResults) {
        throw new Error('请先计算BMD值');
      }

      if (!selectedVertebraLocation) {
        throw new Error('请选择测量节段');
      }

      // 如果ROI已被修改但尚未更新计算结果，提示先更新
      if (roiModified) {
        throw new Error('检测到ROI已被修改，请先点击"更新计算结果"按钮');
      }

      const StudyInstanceUID = trackedStudy;
      const studyMeta = DicomMetadataStore.getStudy(StudyInstanceUID);
      const instanceMeta = studyMeta?.series?.[0]?.instances?.[0];

      if (!studyMeta || !instanceMeta) {
        throw new Error('无法获取研究元数据');
      }

      const patientInfo = {
        id: instanceMeta.PatientID || '',
        name: instanceMeta.PatientName || '',
        gender: instanceMeta.PatientSex || '',
        age: instanceMeta.PatientAge || '',
        height: instanceMeta.PatientSize ? (instanceMeta.PatientSize * 100).toFixed(1) : '0',
        weight: instanceMeta.PatientWeight ? instanceMeta.PatientWeight.toFixed(1) : '0',
        examDate: instanceMeta.StudyDate ? formatDate(instanceMeta.StudyDate) : '',
        examLocation: selectedVertebraLocation,
        printDate: formatDate(new Date().toISOString()),
      };

      const hospitalInfoDefault = {
        Title: '福建省南平市第一医院',
        Address: '福建省南平市延平区中山路317号',
        Department: '放射科',
        Doctor: '李华',
      };

      const hospitalInfo = {
        Title: customizationService?.get('hospitalName') || hospitalInfoDefault.Title,
        Address: customizationService?.get('hospitalAddress') || hospitalInfoDefault.Address,
        Doctor:
          instanceMeta.PerformingPhysicianName ||
          customizationService?.get('defaultDoctor') ||
          hospitalInfoDefault.Doctor,
        Department: customizationService?.get('department') || hospitalInfoDefault.Department,
      };

      const scanParams: ScanParameters = {
        kvp: '120',
        bedHeight: '169.5',
        thickness: '1.25',
        scanField: '500.0',
        ma: '2',
        bedRotation: '61.25',
        collimation: '40',
        kernel: 'STANDARD',
      };

      const processedMeasurements = {
        averageBMD: bmdResults.bmd || 0,
        averageTScore: bmdResults.tScore || 0,
        averageZScore: bmdResults.zScore || 0,
        vertebrae: [
          {
            label: selectedVertebraLocation,
            bmd: bmdResults.bmd || 0,
            tScore: bmdResults.tScore || 0,
            zScore: bmdResults.zScore || 0,
          },
        ],
      };

      if (!processedMeasurements.averageBMD || !patientInfo.id || !hospitalInfo.Title) {
        throw new Error('缺少生成报告所需的必要数据');
      }

      show({
        title: t('Report'),
        content: ReportModal,
        containerDimensions: 'w-[50%] h-[100%]',
        contentProps: {
          dataSource: extensionManager.getActiveDataSource()[0],
          instance: displaySetService.getActiveDisplaySets()[0].instance,
          processedMeasurements,
          patientInfo,
          hospitalInfo,
          scanParams,
        },
      });
    } catch (error) {
      console.error('报告生成错误:', error);
      // 显示错误提示
      setBmdError(error instanceof Error ? error.message : '报告生成错误');
      // 如果是ROI修改未更新导致的错误，弹出提示
      if (error instanceof Error && error.message.includes('ROI已被修改')) {
        setShowROIAdjustmentAlert(true);
      }
    }
  };

  // 更新：处理查看历史报告的函数 - 从URL获取StudyInstanceUID
  const handleViewHistoricalReports = () => {
    try {
      // 尝试从URL获取StudyInstanceUID
      let StudyInstanceUID = '';

      // 方法1: 从URL查询参数获取
      const urlParams = new URLSearchParams(window.location.search);
      const studyIDFromURL = urlParams.get('StudyInstanceUIDs');

      // 方法2: 从trackedStudy获取
      const studyIDFromTracked = trackedStudy;

      // 优先使用URL中的ID，如果没有则使用trackedStudy
      StudyInstanceUID = studyIDFromURL || studyIDFromTracked;

      if (!StudyInstanceUID) {
        console.error('无法获取StudyInstanceUID');
        setBmdError('无法获取研究ID，请确保已加载影像');
        setTimeout(() => {
          setBmdError(null);
        }, 3000);
        return;
      }

      console.log('Redirecting to historical report with StudyInstanceUID:', StudyInstanceUID);

      // 构建URL并在新标签页中打开
      const viewerUrl = `https://106.55.225.253/pacs/stone-webviewer/index.html?study=${StudyInstanceUID}`;
      window.open(viewerUrl, '_blank');
    } catch (error) {
      console.error('访问历史报告时发生错误:', error);
      setBmdError(error instanceof Error ? error.message : '无法访问历史报告');
      setTimeout(() => {
        setBmdError(null);
      }, 3000);
    }
  };

  // 添加CSS动画
  const animationStyles = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out forwards;
    }
  `;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 添加动画样式 */}
      <style>{animationStyles}</style>

      {/* 固定的标题区域 */}
      {renderHeader && (
        <div className="flex-none">
          <div className="bg-primary-dark flex select-none rounded-t pt-1.5 pb-[2px]">
            <div className="flex h-[24px] w-full cursor-pointer select-none justify-center self-center text-[14px]">
              <div className="text-primary-active flex grow cursor-pointer select-none justify-center self-center text-[13px]">
                <span>{tab.label}</span>
              </div>
            </div>
            {getCloseIcon()}
          </div>
          <Separator
            orientation="horizontal"
            className="bg-black"
            thickness="2px"
          />
        </div>
      )}

      {/* 可滚动的内容区域 - 使用flex-grow和overflow-auto */}
      <div className="flex-grow overflow-y-auto">
        <div className="flex flex-col space-y-4 p-4">
          {/* ROI修改提示 */}
          {showROIAdjustmentAlert && (
            <AutoDismissAlert
              message="检测到ROI位置已修改，请点击下方的'更新计算结果'按钮重新计算骨密度。"
              type="warning"
              duration={8000}
              onDismiss={() => setShowROIAdjustmentAlert(false)}
            />
          )}

          {/* Vertebrae Selection Section - Moved to the top */}
          {hasMeasurements() && (
            <div className="bg-primary-dark rounded p-4">
              {isVertebraConfirmed && selectedVertebraLocation ? (
                <div className="flex items-center justify-between">
                  <div className="text-primary-light text-[14px]">
                    当前选择的椎体节段：
                    <span className="ml-2 font-medium text-white">{selectedVertebraLocation}</span>
                  </div>
                  <button
                    className="text-sm text-blue-400 hover:text-blue-300"
                    onClick={() => {
                      setSelectedVertebraLocation('');
                      setIsVertebraConfirmed(false);
                      setRoiModified(false);
                      setShowROIAdjustmentAlert(false);
                    }}
                  >
                    重新选择
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-primary-active mb-3 text-[14px] font-semibold">
                    请选择当前测量的椎体节段
                  </div>
                  <div className="flex max-h-48 flex-col space-y-2 overflow-y-auto">
                    {VERTEBRAE_OPTIONS.map(vertebra => (
                      <button
                        key={vertebra}
                        className={`rounded p-2 text-left transition-all duration-200 ${
                          selectedVertebraLocation === vertebra
                            ? 'bg-blue-500 text-white'
                            : 'bg-blue-500/10 text-white/80 hover:bg-blue-500/20'
                        }`}
                        onClick={() => handleVertebraSelection(vertebra)}
                      >
                        {vertebra}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* BMD Results Section */}
          {bmdError ? (
            <div className="rounded bg-red-500/10 p-4 text-red-400">
              <div className="text-[13px]">{bmdError}</div>
            </div>
          ) : (
            bmdResults && <BMDResults results={bmdResults} />
          )}

          {/* No measurements message */}
          {!hasMeasurements() && (
            <div className="bg-primary-dark rounded p-4">
              <div className="text-primary-light text-[13px]">请先在图像上进行测量标注</div>
            </div>
          )}
        </div>
      </div>

      {/* 固定的底部操作按钮区域 - 现代化设计 */}
      <div className="bg-primary-dark flex-none border-t border-gray-800 p-4">
        {/* 自定义按钮布局 - 前两个按钮一行，查看历史报告单独一行 */}
        <div className="flex flex-col space-y-2">
          {/* 第一行：更新计算结果和生成报告并排 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 更新计算结果按钮 */}
            <button
              className={`transform rounded-md py-2 px-4 text-center font-medium text-white transition-all duration-200 ${
                !appConfig?.disableEditing && isVertebraConfirmed && selectedVertebraLocation
                  ? roiModified
                    ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : 'cursor-not-allowed bg-blue-700/70 text-blue-100/80'
              }`}
              onClick={calculateBMD}
              disabled={
                appConfig?.disableEditing || !isVertebraConfirmed || !selectedVertebraLocation
              }
            >
              更新计算结果
            </button>

            {/* 生成报告按钮 */}
            <button
              className={`transform rounded-md py-2 px-4 text-center font-medium text-white transition-all duration-200 ${
                !appConfig?.disableEditing && bmdResults && !roiModified
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : 'cursor-not-allowed bg-blue-700/70 text-blue-100/80'
              }`}
              onClick={handleCreateReport}
              disabled={appConfig?.disableEditing || !bmdResults || roiModified}
            >
              生成报告
            </button>
          </div>

          {/* 第二行：查看历史报告单独一行 */}
          <button
            className="transform rounded-md bg-blue-600 py-2 px-4 text-center font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
            onClick={handleViewHistoricalReports}
          >
            查看历史骨密度报告
          </button>
        </div>
      </div>
    </div>
  );
}

PanelMeasurementTableTracking.propTypes = {
  servicesManager: PropTypes.shape({
    services: PropTypes.shape({
      measurementService: PropTypes.shape({
        getMeasurements: PropTypes.func.isRequired,
        VALUE_TYPES: PropTypes.object.isRequired,
      }).isRequired,
      uiDialogService: PropTypes.shape({
        dismiss: PropTypes.func.isRequired,
        create: PropTypes.func.isRequired,
      }).isRequired,
    }).isRequired,
  }).isRequired,
};

export default PanelMeasurementTableTracking;
