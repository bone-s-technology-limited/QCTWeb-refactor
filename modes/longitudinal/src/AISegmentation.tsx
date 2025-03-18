import React from 'react';

const AISegmentationDialog = ({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const handleSubmit = async () => {
    try {
      const response = await fetch('https://10.0.10.72:5000/api/upload-seg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '请上传segmentation',
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

  const headerStyle = {
    display: 'flex',
    justifyContent: 'center', // 居中标题
    alignItems: 'center',
    padding: '16px',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#66CCFF', // 浅蓝色标题
  };

  const contentStyle = {
    padding: '16px',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#ffffff',
    textAlign: 'center', // 居中内容文字
  };

  const buttonContainerStyle = {
    display: 'flex',
    justifyContent: 'center', // 居中按钮
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
    backgroundColor: '#3D7CF3', // 蓝色按钮
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
