// AISegmentationDialog.tsx
import React from 'react';
import { DicomMetadataStore } from '@ohif/core';

const AISegmentationDialog = ({
  onClose,
  onSubmit,
  viewportData,
  servicesManager,
  commandsManager,
  uiDialogService, // 添加 OHIF 的对话框服务
}) => {
  // 获取当前 SeriesInstanceUID 的函数
  const getCurrentSeriesUID = () => {
    console.log('开始获取 SeriesInstanceUID...');

    // 方法1: 从 servicesManager 获取
    if (servicesManager) {
      try {
        const { viewportGridService, displaySetService } = servicesManager.services;
        const viewports = viewportGridService?.getState().viewports;
        const activeViewportIndex = viewportGridService?.getState().activeViewportIndex ?? 0;
        const activeViewport = viewports?.[activeViewportIndex];

        if (activeViewport?.displaySetInstanceUIDs?.[0]) {
          const displaySet = displaySetService.getDisplaySetByUID(
            activeViewport.displaySetInstanceUIDs[0]
          );
          console.log('找到 displaySet:', displaySet);

          if (displaySet?.SeriesInstanceUID) {
            console.log(
              '通过 servicesManager 找到 SeriesInstanceUID:',
              displaySet.SeriesInstanceUID
            );
            return displaySet.SeriesInstanceUID;
          }
        }
      } catch (error) {
        console.error('方法1获取失败:', error);
      }
    }

    // 方法2: 从 commandsManager 获取
    if (commandsManager) {
      try {
        const activeViewport = commandsManager.runCommand('getActiveViewportEnabledElement');
        console.log('activeViewport:', activeViewport);

        if (activeViewport?.viewport?.displaySetInstanceUID) {
          const { displaySetService } = servicesManager.services;
          const displaySet = displaySetService.getDisplaySetByUID(
            activeViewport.viewport.displaySetInstanceUID
          );

          if (displaySet?.SeriesInstanceUID) {
            console.log(
              '通过 commandsManager 找到 SeriesInstanceUID:',
              displaySet.SeriesInstanceUID
            );
            return displaySet.SeriesInstanceUID;
          }
        }
      } catch (error) {
        console.error('方法2获取失败:', error);
      }
    }

    // 方法3: 直接从全局状态获取
    if (window?.config?.globalState) {
      try {
        const activeViewport = window.config.globalState.activeViewport;
        if (activeViewport?.metadata?.SeriesInstanceUID) {
          console.log(
            '通过全局状态找到 SeriesInstanceUID:',
            activeViewport.metadata.SeriesInstanceUID
          );
          return activeViewport.metadata.SeriesInstanceUID;
        }
      } catch (error) {
        console.error('方法3获取失败:', error);
      }
    }

    // 方法4: 从 DicomMetadataStore 获取第一个可用的 Series
    try {
      const studies = DicomMetadataStore.getStudyInstanceUIDs();
      if (studies.length > 0) {
        const study = DicomMetadataStore.getStudy(studies[0]);
        if (study?.series?.[0]?.SeriesInstanceUID) {
          console.log(
            '通过 DicomMetadataStore 找到 SeriesInstanceUID:',
            study.series[0].SeriesInstanceUID
          );
          return study.series[0].SeriesInstanceUID;
        }
      }
    } catch (error) {
      console.error('方法4获取失败:', error);
    }

    console.error('所有方法均未能获取到 SeriesInstanceUID');
    return null;
  };

  const handleSubmit = async () => {
    try {
      const seriesUID = getCurrentSeriesUID();

      if (!seriesUID) {
        console.error('无法获取 SeriesInstanceUID');
        console.error('viewportData:', viewportData);
        console.error('servicesManager:', servicesManager);
        console.error('commandsManager:', commandsManager);

        alert('无法获取当前Series的标识，请确保已加载影像');
        return;
      }

      console.log('正在发送分割请求，SeriesInstanceUID:', seriesUID);

      const response = await fetch('https://106.55.225.253/api/calculation/seg-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '请上传segmentation',
          seriesUID: seriesUID,
        }),
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const data = await response.json();
      console.log('上传成功:', data);
      onSubmit();
    } catch (error) {
      console.error('上传失败:', error);
      alert(`上传分割文件失败: ${error.message}`);
    } finally {
      onClose();
    }
  };

  // 样式定义保持不变...
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: '#060C1F',
    color: '#ffffff',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    overflow: 'hidden',
    width: '400px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const contentStyle = {
    padding: '16px',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#ffffff',
    textAlign: 'center' as const,
  };

  const buttonContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    padding: '16px',
    marginTop: '8px',
  };

  const cancelButtonStyle = {
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: '1px solid rgba(154, 175, 202, 0.5)',
    padding: '8px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  };

  const submitButtonStyle = {
    backgroundColor: '#3D7CF3',
    color: '#ffffff',
    border: 'none',
    padding: '8px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <p>点击"开始分割"按钮将启动AI分割过程。</p>
        <p>系统将分析当前影像并生成分割结果。</p>
      </div>
      <div style={buttonContainerStyle}>
        <button
          style={submitButtonStyle}
          onClick={handleSubmit}
        >
          开始分割
        </button>
        <button
          style={cancelButtonStyle}
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>
  );
};

export default AISegmentationDialog;
