import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

// 导入图片
import logoImage from '../../../assets/images/logo.png';

// 导入 SVG 图标
import imagingIcon from './imaging.svg';
import reportsIcon from './reports.svg';
import statisticsIcon from './statistics.svg';

const stickyClasses = 'sticky top-0';
const notStickyClasses = 'relative';

// 视觉居中的导航组件
const ModuleNavigation = ({ activeModule, onModuleChange }) => {
  const modules = [
    { id: 'imaging', label: '影像中心', path: '/', icon: imagingIcon },
    { id: 'reports', label: '报告中心', path: '/reports', icon: reportsIcon },
    { id: 'statistics', label: '统计中心', path: '/statistics', icon: statisticsIcon }
  ];
  
  return (
    <div className="flex justify-center items-center">
      <div className="flex space-x-8 md:space-x-12 lg:space-x-20">
        {modules.map((module) => (
          <div 
            key={module.id}
            className="relative py-3 cursor-pointer group"
            onClick={() => onModuleChange(module.id, module.path)}
          >
            <div className="flex items-center">
              {/* SVG 图标 */}
              <img 
                src={module.icon} 
                alt={`${module.label} 图标`} 
                className={classnames(
                  'w-6 h-6 mr-2',
                  activeModule === module.id 
                    ? 'opacity-100' 
                    : 'opacity-70 group-hover:opacity-90',
                    'transition-opacity'
                )}
              />
              
              {/* 模块名称 */}
              <span 
                className={classnames(
                  'text-lg font-medium transition-colors',
                  activeModule === module.id 
                    ? 'text-white font-semibold' 
                    : 'text-[#91b9cd] group-hover:text-blue-300'
                )}
              >
                {module.label}
              </span>
            </div>
            
            {/* 底部指示器 */}
            {activeModule === module.id ? (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500"></div>
            ) : (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-transparent group-hover:bg-blue-700 opacity-0 group-hover:opacity-30 transition-opacity"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const NavBar = ({ className, children, isSticky, onNavigate, initialActiveModule }) => {
  // 根据传入的初始活跃模块或基于当前路径确定活跃模块
  const [activeModule, setActiveModule] = useState(() => {
    // 如果提供了初始活跃模块，则使用它
    if (initialActiveModule) {
      return initialActiveModule;
    }
    
    // 否则基于当前路径判断
    const path = window.location.pathname;
    if (path.includes('/reports')) {
      return 'reports';
    } else if (path.includes('/statistics')) {
      return 'statistics';
    } else {
      return 'imaging'; // 默认为影像中心
    }
  });
  
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
        'z-20 border-black bg-[#2a2a66] px-1 shadow-md',
        isSticky && stickyClasses,
        !isSticky && notStickyClasses,
        className
      )}
    >
      <div className="grid grid-cols-3 w-full items-center h-16">
        {/* Logo 容器 - 左侧 1/3 区域 */}
        <div className="flex justify-start pl-6">
          <img
            src={logoImage}
            alt="Logo"
            className="h-6"
          />
        </div>

        {/* 视觉居中的导航 - 中间 1/3 区域 */}
        <div className="flex justify-center">
          <ModuleNavigation
            activeModule={activeModule}
            onModuleChange={handleModuleChange}
          />
        </div>

        {/* 用户信息/其他内容 - 右侧 1/3 区域 */}
        <div className="flex justify-end pr-6">
          {children ? children : <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-500 rounded-full flex items-center justify-center text-white text-xs">用户</div>}
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
  onNavigate: PropTypes.func,
  initialActiveModule: PropTypes.string
};

export default NavBar;