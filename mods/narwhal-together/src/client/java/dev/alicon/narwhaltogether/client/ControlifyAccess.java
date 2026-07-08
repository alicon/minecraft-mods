package dev.alicon.narwhaltogether.client;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Optional;

final class ControlifyAccess {
	private boolean unavailable;
	private Object controlifyApi;
	private Class<?> bindingsClass;
	private Method getCurrentController;

	boolean initialize() {
		if (this.unavailable) {
			return false;
		}
		if (this.controlifyApi != null) {
			return true;
		}

		try {
			Class<?> apiClass = Class.forName("dev.isxander.controlify.api.ControlifyApi");
			this.bindingsClass = Class.forName("dev.isxander.controlify.bindings.ControlifyBindings");
			this.controlifyApi = apiClass.getMethod("get").invoke(null);
			this.getCurrentController = apiClass.getMethod("getCurrentController");
			return true;
		} catch (ReflectiveOperationException | LinkageError exception) {
			this.markUnavailable();
			return false;
		}
	}

	void markUnavailable() {
		this.unavailable = true;
	}

	Optional<?> currentController() throws ReflectiveOperationException {
		return (Optional<?>) this.getCurrentController.invoke(this.controlifyApi);
	}

	Object binding(String name) throws ReflectiveOperationException {
		return staticField(this.bindingsClass, name);
	}

	static Object staticField(Class<?> owner, String name) throws ReflectiveOperationException {
		Field field = owner.getField(name);
		return field.get(null);
	}

	static Method methodNamed(Class<?> owner, String name, int parameterCount) throws NoSuchMethodException {
		for (Method method : owner.getMethods()) {
			if (method.getName().equals(name) && method.getParameterCount() == parameterCount) {
				return method;
			}
		}
		throw new NoSuchMethodException(owner.getName() + "." + name);
	}
}
