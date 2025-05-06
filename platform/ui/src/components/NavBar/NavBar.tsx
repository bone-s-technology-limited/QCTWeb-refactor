import React, { useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

// 导入图片
import logoImage from '../../../assets/images/logo.png';

const stickyClasses = 'sticky top-0';
const notStickyClasses = 'relative';

// 视觉居中的导航组件
const ModuleNavigation = ({ activeModule, onModuleChange }) => {
  const modules = [
    { id: 'imaging', label: '影像中心', path: '/' },
    { id: 'reports', label: '报告中心', path: '/reports' },
    { id: 'statistics', label: '统计中心', path: '/statistics' }
  ];
  
  return (
    <div className="flex justify-center items-center flex-grow" style={{ marginLeft: '-60px' }}>
      {/* 使用负边距调整位置，实现视觉居中 */}
      <div className="flex space-x-12">
        {modules.map((module) => (
          <div 
            key={module.id}
            className="relative py-3 cursor-pointer"
            onClick={() => onModuleChange(module.id, module.path)}
          >
            <span 
              className={classnames(
                'text-sm font-medium hover:text-white transition-colors',
                activeModule === module.id ? 'text-white' : 'text-[#91b9cd]'
              )}
            >
              {module.label}
            </span>
            {activeModule === module.id && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const NavBar = ({ className, children, isSticky, onNavigate }) => {
  // 添加模块状态管理
  const [activeModule, setActiveModule] = useState('imaging'); // 默认为影像中心
  
  // 处理模块切换
  const handleModuleChange = (moduleName, path) => {
    setActiveModule(moduleName);
    
    // 如果有提供导航回调函数，则执行导航
    if (typeof onNavigate === 'function') {
      onNavigate(path);
    } else {
      // 备用方案
      window.location.href = path;
    }
  };

  return (
    <div
      className={classnames(
        'z-20 border-black bg-[#2a2a66] px-1',
        isSticky && stickyClasses,
        !isSticky && notStickyClasses,
        className
      )}
    >
      <div className="flex w-full items-center h-14">
        {/* Logo 容器 - 靠左 */}
        <div className="ml-4 flex-shrink-0">
          <img
            src={logoImage}
            alt="Logo"
            className="h-8"
          />
        </div>

        {/* 视觉居中的导航 */}
        <ModuleNavigation
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
        />

        {/* 用户信息/其他内容 - 靠右 */}
        <div className="mr-4 flex-shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
};

ModuleNavigation.propTypes = {
  activeModule: PropTypes.string.isRequired,
  onModuleChange: PropTypes.func.isRequired
};

NavBar.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  isSticky: PropTypes.bool,
  onNavigate: PropTypes.func
};

export default NavBar;